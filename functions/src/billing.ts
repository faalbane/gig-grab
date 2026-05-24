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
import { db, candidates, matches, type CandidateBillingTier } from "@gig-grab/db";
import { eq, sql } from "drizzle-orm";

export type BillingInterval = "week" | "month";

export const TIER_PLANS: Record<
  CandidateBillingTier,
  Record<
    BillingInterval,
    { priceId: string; applications: number; amountCents: number }
  > & { label: string }
> = {
  starter: {
    label: "Starter",
    week: {
      priceId: "price_1TZqdCCX4iU4nm42dP6qoI0S",
      applications: 20,
      amountCents: 999,
    },
    month: {
      priceId: "price_1TZquFCX4iU4nm42CTng9KAQ",
      applications: 80,
      amountCents: 1999,
    },
  },
  professional: {
    label: "Professional",
    week: {
      priceId: "price_1TZqdDCX4iU4nm42WJkaxVAK",
      applications: 50,
      amountCents: 1999,
    },
    month: {
      priceId: "price_1TZquFCX4iU4nm42jVuZDpHD",
      applications: 150,
      amountCents: 2999,
    },
  },
  premium: {
    label: "Premium",
    week: {
      priceId: "price_1TZqdECX4iU4nm42u4zh2hZP",
      applications: 100,
      amountCents: 2999,
    },
    month: {
      priceId: "price_1TZquFCX4iU4nm429cZ7B8xj",
      applications: 300,
      amountCents: 4999,
    },
  },
};

// Free tier: every new candidate gets 10 applications, no card needed.
export const FREE_APPLICATIONS = 10;

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
  // Period total so the client can show "X of N used" without
  // hardcoding tier→quota mapping. Free tier = FREE_APPLICATIONS;
  // paid tier reads from TIER_PLANS using the current sub interval.
  let periodTotal = FREE_APPLICATIONS;
  let interval: BillingInterval = "week";
  if (c.billingTier && c.stripeSubscriptionId) {
    // Best-effort: peek at the subscription for its interval.
    try {
      const sub = (await stripeClient().subscriptions.retrieve(
        c.stripeSubscriptionId,
      )) as unknown as {
        items?: { data: Array<{ price?: { recurring?: { interval?: string } } }> };
      };
      if (sub.items?.data?.[0]?.price?.recurring?.interval === "month") {
        interval = "month";
      }
    } catch {
      // ignore; default to week
    }
    periodTotal =
      TIER_PLANS[c.billingTier]?.[interval]?.applications ??
      TIER_PLANS[c.billingTier]?.week?.applications ??
      FREE_APPLICATIONS;
  }
  // Source of truth: count rows in `matches` directly. The denormalized
  // counter `candidates.applicationsRemaining` is a cache used by the
  // quota gate in accountJobsApply, but two write paths exist (web +
  // phone-apply-intent in profile.ts) and they have historically
  // drifted. Counting matches eliminates that class of bug at the
  // display layer.
  //
  // Window: paid tier counts only since the current period started
  // (applicationsResetAt — set by the webhook on checkout/renewal).
  // Free tier counts all-time (no reset mechanism exists today).
  const periodStart = c.billingTier ? c.applicationsResetAt : null;
  const usedConds = [
    eq(matches.candidateId, c.id),
    eq(matches.status, "applied"),
  ];
  if (periodStart) {
    usedConds.push(sql`${matches.createdAt} >= ${periodStart}`);
  }
  const [{ n: applicationsUsed }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .where(sql.join(usedConds, sql` AND `));
  const displayRemaining = Math.max(0, periodTotal - applicationsUsed);
  res.json({
    tier: c.billingTier,
    status: c.billingStatus,
    applicationsRemaining: displayRemaining,
    applicationsUsed,
    periodTotal,
    interval,
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
  const interval = (String((req.body ?? {}).interval ?? "week").toLowerCase() ===
  "month"
    ? "month"
    : "week") as BillingInterval;
  const plan = TIER_PLANS[tier];
  if (!plan) {
    res.status(400).json({ error: "bad tier" });
    return;
  }
  const priceConfig = plan[interval];

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
    line_items: [{ price: priceConfig.priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?billing=success&tier=${tier}`,
    cancel_url: `${origin}/pricing?billing=canceled`,
    allow_promotion_codes: true,
    metadata: { candidateId: c.id, tier, interval },
    subscription_data: { metadata: { candidateId: c.id, tier, interval } },
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
        const interval = ((s.metadata?.interval ?? "week") as BillingInterval);
        if (!candidateId || !TIER_PLANS[tier]) break;
        const priceConfig =
          TIER_PLANS[tier][interval] ?? TIER_PLANS[tier].week;
        const subId = (s.subscription as string) ?? null;
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
            applicationsRemaining: priceConfig.applications,
            applicationsResetAt: new Date(),
          })
          .where(eq(candidates.id, candidateId));
        console.log(
          `[stripe/webhook] checkout completed candidate=${candidateId} tier=${tier} interval=${interval} apps=${priceConfig.applications}`,
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
        const tierConfig = TIER_PLANS[c.billingTier];
        if (!tierConfig) break;
        const sub = (await stripeClient().subscriptions.retrieve(
          subId,
        )) as unknown as StripeSubscription;
        const periodEnd = new Date((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0) * 1000);
        // Pick interval based on the subscription's recurring price.
        // Lookup the first item's price ID → match to TIER_PLANS.
        const items = (sub as unknown as { items?: { data: Array<{ price?: { id?: string; recurring?: { interval?: string } } }> } }).items;
        const intervalFromSub = items?.data?.[0]?.price?.recurring?.interval;
        const interval: BillingInterval =
          intervalFromSub === "month" ? "month" : "week";
        const priceConfig = tierConfig[interval] ?? tierConfig.week;
        await db()
          .update(candidates)
          .set({
            billingStatus: "active",
            billingPeriodEnd: periodEnd,
            applicationsRemaining: priceConfig.applications,
            applicationsResetAt: new Date(),
          })
          .where(eq(candidates.id, c.id));
        console.log(
          `[stripe/webhook] invoice.paid candidate=${c.id} interval=${interval} reset apps=${priceConfig.applications}`,
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
