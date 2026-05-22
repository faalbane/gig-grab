/**
 * Stripe billing for candidate weekly subscriptions.
 *
 * Pricing (live, set up via Stripe API 2026-05-22):
 *   - Starter      $9.99/wk → 20 applications/wk  (price_1TZqdCCX4iU4nm42dP6qoI0S)
 *   - Professional $19.99/wk → 50 applications/wk (price_1TZqdDCX4iU4nm42WJkaxVAK)
 *   - Premium      $29.99/wk → 100 applications/wk (price_1TZqdECX4iU4nm42u4zh2hZP)
 *
 * Flow:
 *   1. POST /api/billing/checkout { tier } → creates a Stripe Checkout
 *      Session. Returns { url }. Client redirects to Stripe-hosted page.
 *   2. Stripe Checkout completes → webhook checkout.session.completed
 *      → we look up the candidate by stripe_customer_id (or metadata),
 *      set billing_tier/status/subscription_id/period_end, and seed
 *      applications_remaining from the tier quota.
 *   3. Recurring weekly invoice.paid → reset applications_remaining,
 *      bump applications_reset_at + billing_period_end.
 *   4. customer.subscription.deleted / .updated → mark canceled, leave
 *      applications_remaining alone so the user can finish out the
 *      paid period.
 *
 * Quota gate lives in accountJobsApply.
 */

import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getAuth } from "firebase-admin/auth";
import StripeCtor from "stripe";

// Namespace types from the v22 SDK aren't ergonomically exposed via the
// default export. We pull a typed Stripe instance alias and use `any`
// for event payload shapes — runtime data has the fields; we just lose
// some compile-time autocomplete. Pilot scope.
type Stripe = StripeCtor.Stripe;
type StripeEvent = { type: string; data: { object: unknown } };
type StripeCheckoutSession = {
  metadata?: Record<string, string | null | undefined>;
  subscription?: string | null;
  customer?: string | null;
};
type StripeInvoice = { subscription?: string | null };
type StripeSubscription = {
  id: string;
  status: string;
  current_period_end?: number;
  items?: { data: Array<{ current_period_end?: number }> };
};
import { db, candidates, type CandidateBillingTier } from "@gig-grab/db";
import { eq, sql } from "drizzle-orm";

export const TIER_PLANS: Record<
  CandidateBillingTier,
  { priceId: string; appsPerWeek: number; label: string; amountCents: number }
> = {
  starter: {
    priceId: "price_1TZqdCCX4iU4nm42dP6qoI0S",
    appsPerWeek: 20,
    label: "Starter",
    amountCents: 999,
  },
  professional: {
    priceId: "price_1TZqdDCX4iU4nm42WJkaxVAK",
    appsPerWeek: 50,
    label: "Professional",
    amountCents: 1999,
  },
  premium: {
    priceId: "price_1TZqdECX4iU4nm42u4zh2hZP",
    appsPerWeek: 100,
    label: "Premium",
    amountCents: 2999,
  },
};

function publicWebOrigin(): string {
  return process.env.PUBLIC_WEB_URL ?? "https://giggrab.io";
}

// Self-bootstrap: add the billing columns if the prod DB is on the
// pre-Stripe schema. Idempotent.
let billingSchemaEnsured = false;
export async function ensureBillingSchema(): Promise<void> {
  if (billingSchemaEnsured) return;
  try {
    await db().execute(sql`
      ALTER TABLE candidates
        ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
        ADD COLUMN IF NOT EXISTS billing_tier TEXT,
        ADD COLUMN IF NOT EXISTS billing_status TEXT,
        ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS applications_remaining INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS applications_reset_at TIMESTAMPTZ
    `);
    billingSchemaEnsured = true;
  } catch (err) {
    console.warn("[billing/migrate] schema ensure failed", err);
  }
}

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  // Pin to the API version Stripe is currently sending so webhook
  // event shapes match what the SDK types expect.
  return new StripeCtor(key, { apiVersion: "2026-04-22.dahlia" });
}

type AuthCtx = { uid: string; email: string | null };

async function decodeBearer(req: Request): Promise<AuthCtx | null> {
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) return null;
  try {
    const d = await getAuth().verifyIdToken(tok);
    return { uid: d.uid, email: (d.email ?? null) as string | null };
  } catch {
    return null;
  }
}

/**
 * GET /api/billing/me — returns the signed-in candidate's billing
 * state: tier, status, applicationsRemaining, periodEnd.
 */
export async function billingMe(req: Request, res: Response): Promise<void> {
  await ensureBillingSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const [c] = await db()
    .select()
    .from(candidates)
    .where(eq(candidates.firebaseUid, auth.uid))
    .limit(1);
  if (!c) {
    res.json({ tier: null, status: null, applicationsRemaining: 0 });
    return;
  }
  res.json({
    tier: c.billingTier,
    status: c.billingStatus,
    applicationsRemaining: c.applicationsRemaining,
    periodEnd: c.billingPeriodEnd,
    hasSubscription: !!c.stripeSubscriptionId,
  });
}

/**
 * POST /api/billing/checkout { tier } — creates a Stripe Checkout
 * Session for the requested tier. Returns { url }.
 */
export async function billingCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureBillingSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const tier = String(
    (req.body ?? {}).tier ?? "",
  ).toLowerCase() as CandidateBillingTier;
  const plan = TIER_PLANS[tier];
  if (!plan) {
    res.status(400).json({ error: "bad tier" });
    return;
  }

  const [c] = await db()
    .select()
    .from(candidates)
    .where(eq(candidates.firebaseUid, auth.uid))
    .limit(1);
  if (!c) {
    res.status(409).json({ error: "no candidate row — finish onboarding first" });
    return;
  }

  const stripe = stripeClient();
  let customerId = c.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.email ?? c.email ?? undefined,
      phone: c.phone.startsWith("pending-") ? undefined : c.phone,
      metadata: { candidateId: c.id, firebaseUid: auth.uid },
    });
    customerId = customer.id;
    await db()
      .update(candidates)
      .set({ stripeCustomerId: customerId })
      .where(eq(candidates.id, c.id));
  }

  const origin = publicWebOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?billing=success&tier=${tier}`,
    cancel_url: `${origin}/pricing?billing=canceled`,
    allow_promotion_codes: true,
    metadata: { candidateId: c.id, tier },
    subscription_data: { metadata: { candidateId: c.id, tier } },
  });

  res.json({ url: session.url, id: session.id });
}

/**
 * POST /api/billing/portal — returns a Stripe Customer Portal URL so
 * the user can manage / cancel their subscription self-serve.
 */
export async function billingPortal(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureBillingSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const [c] = await db()
    .select({ stripeCustomerId: candidates.stripeCustomerId })
    .from(candidates)
    .where(eq(candidates.firebaseUid, auth.uid))
    .limit(1);
  if (!c?.stripeCustomerId) {
    res.status(409).json({ error: "no stripe customer yet" });
    return;
  }
  const stripe = stripeClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: c.stripeCustomerId,
    return_url: `${publicWebOrigin()}/dashboard`,
  });
  res.json({ url: portal.url });
}

/**
 * POST /api/stripe/webhook — Stripe-signed event handler.
 * Required body parsing: RAW. Firebase Functions Gen2 onRequest gives
 * us req.rawBody so we can verify the signature.
 */
export async function stripeWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureBillingSchema();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    res.status(500).send();
    return;
  }
  const sig = req.header("stripe-signature") ?? "";
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) {
    console.error("[stripe/webhook] missing rawBody");
    res.status(400).send();
    return;
  }
  let event: StripeEvent;
  try {
    event = stripeClient().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe/webhook] signature verify failed", err);
    res.status(400).send();
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as StripeCheckoutSession;
        const candidateId = (s.metadata?.candidateId ?? "") as string;
        const tier = (s.metadata?.tier ?? "") as CandidateBillingTier;
        if (!candidateId || !TIER_PLANS[tier]) break;
        const plan = TIER_PLANS[tier];
        const subId = (s.subscription as string) ?? null;
        // Pull subscription for period_end.
        let periodEnd: Date | null = null;
        if (subId) {
          const sub = (await stripeClient().subscriptions.retrieve(
            subId,
          )) as unknown as StripeSubscription;
          periodEnd = new Date((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0) * 1000);
        }
        await db()
          .update(candidates)
          .set({
            stripeCustomerId: (s.customer as string) ?? undefined,
            stripeSubscriptionId: subId ?? undefined,
            billingTier: tier,
            billingStatus: "active",
            billingPeriodEnd: periodEnd,
            applicationsRemaining: plan.appsPerWeek,
            applicationsResetAt: new Date(),
          })
          .where(eq(candidates.id, candidateId));
        console.log(
          `[stripe/webhook] checkout completed candidate=${candidateId} tier=${tier} apps=${plan.appsPerWeek}`,
        );
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as StripeInvoice;
        const subId = inv.subscription as string | null;
        if (!subId) break;
        const [c] = await db()
          .select({ id: candidates.id, billingTier: candidates.billingTier })
          .from(candidates)
          .where(eq(candidates.stripeSubscriptionId, subId))
          .limit(1);
        if (!c?.billingTier) break;
        const plan = TIER_PLANS[c.billingTier];
        if (!plan) break;
        const sub = (await stripeClient().subscriptions.retrieve(
          subId,
        )) as unknown as StripeSubscription;
        const periodEnd = new Date((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0) * 1000);
        await db()
          .update(candidates)
          .set({
            billingStatus: "active",
            billingPeriodEnd: periodEnd,
            applicationsRemaining: plan.appsPerWeek,
            applicationsResetAt: new Date(),
          })
          .where(eq(candidates.id, c.id));
        console.log(
          `[stripe/webhook] invoice.paid candidate=${c.id} reset apps=${plan.appsPerWeek}`,
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeSubscription;
        const [c] = await db()
          .select({ id: candidates.id })
          .from(candidates)
          .where(eq(candidates.stripeSubscriptionId, sub.id))
          .limit(1);
        if (!c) break;
        await db()
          .update(candidates)
          .set({
            billingStatus: sub.status,
            billingPeriodEnd: (sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0)
              ? new Date((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0) * 1000)
              : null,
          })
          .where(eq(candidates.id, c.id));
        console.log(
          `[stripe/webhook] sub ${event.type} candidate=${c.id} status=${sub.status}`,
        );
        break;
      }
      default:
        // Unhandled event types are fine; Stripe expects 200.
        break;
    }
    res.status(200).send();
  } catch (err) {
    console.error("[stripe/webhook] handler failed", err);
    res.status(500).send();
  }
}
