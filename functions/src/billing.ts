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
import {
  db,
  candidates,
  matches,
  employers,
  type CandidateBillingTier,
  type EmployerBillingTier,
} from "@gig-grab/db";
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

// Employer Stripe plans.
//
// ▶ PLACEHOLDER AMOUNTS — edit `amountCents` / `reviews` before sharing
//   the checkout link with a real employer. Stripe Checkout uses
//   `price_data` inline so no pre-created Stripe Price IDs needed; the
//   amounts here ARE the amounts charged. Currency = USD.
// ▶ Reviews = each shortlist / interview-request / reject action on a
//   candidate counts as one. Mirrors the free-tier `freeReviewsUsed`
//   counter on employers.
// ▶ Unlimited tier uses 999_999 sentinel; gate code treats as effectively
//   uncapped.
export const EMPLOYER_FREE_REVIEWS = 3;

export const EMPLOYER_TIER_PLANS: Record<
  EmployerBillingTier,
  Record<
    BillingInterval,
    { reviews: number; amountCents: number }
  > & { label: string; productName: string }
> = {
  lite: {
    label: "Hiring Lite",
    productName: "GigGrab Hiring Lite",
    week: { reviews: 25, amountCents: 9900 },
    month: { reviews: 100, amountCents: 29900 },
  },
  pro: {
    label: "Hiring Pro",
    productName: "GigGrab Hiring Pro",
    week: { reviews: 100, amountCents: 24900 },
    month: { reviews: 400, amountCents: 74900 },
  },
  scale: {
    label: "Hiring Scale",
    productName: "GigGrab Hiring Scale",
    week: { reviews: 999999, amountCents: 49900 },
    month: { reviews: 999999, amountCents: 149900 },
  },
};

/**
 * Idempotent ALTER so employer billing columns land on the prod DB
 * without an out-of-band migration. Mirrors ensureBillingSchema for
 * candidates. First call per cold start runs the ALTER; subsequent
 * calls short-circuit.
 */
let employerBillingSchemaEnsured = false;
export async function ensureEmployerBillingSchema(): Promise<void> {
  if (employerBillingSchemaEnsured) return;
  try {
    await db().execute(sql`
      ALTER TABLE employers
        ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
        ADD COLUMN IF NOT EXISTS billing_tier TEXT,
        ADD COLUMN IF NOT EXISTS billing_status TEXT,
        ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reviews_remaining INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS reviews_reset_at TIMESTAMPTZ
    `);
    employerBillingSchemaEnsured = true;
  } catch (err) {
    console.warn("[employer-billing/migrate] schema ensure failed", err);
  }
}

/**
 * Canonical quota lookup. Reads `matches` directly so we never depend
 * on the denormalized `candidates.applicationsRemaining` counter (which
 * has historically drifted because two write paths exist). Used by
 * both billingMe (display) and accountJobsApply (gate) so they always
 * agree.
 *
 * Window: paid tiers count rows since applicationsResetAt (set by the
 * Stripe webhook on checkout/renewal). Free tier counts all-time —
 * no reset cron exists today.
 */
export type CandidateQuotaInput = {
  id: string;
  billingTier: CandidateBillingTier | null;
  stripeSubscriptionId: string | null;
  applicationsResetAt: Date | null;
};

export type CandidateQuota = {
  periodTotal: number;
  applicationsUsed: number;
  applicationsRemaining: number;
  interval: BillingInterval;
};

export async function getCandidateQuota(
  c: CandidateQuotaInput,
): Promise<CandidateQuota> {
  let periodTotal = FREE_APPLICATIONS;
  let interval: BillingInterval = "week";
  if (c.billingTier && c.stripeSubscriptionId) {
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
  const applicationsRemaining = Math.max(0, periodTotal - applicationsUsed);
  return { periodTotal, applicationsUsed, applicationsRemaining, interval };
}

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
        ADD COLUMN IF NOT EXISTS applications_reset_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS preferred_name TEXT
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
  const quota = await getCandidateQuota({
    id: c.id,
    billingTier: c.billingTier,
    stripeSubscriptionId: c.stripeSubscriptionId,
    applicationsResetAt: c.applicationsResetAt,
  });
  res.json({
    tier: c.billingTier,
    status: c.billingStatus,
    applicationsRemaining: quota.applicationsRemaining,
    applicationsUsed: quota.applicationsUsed,
    periodTotal: quota.periodTotal,
    interval: quota.interval,
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

// ===========================================================================
// Employer billing
// ===========================================================================

export type EmployerQuota = {
  periodTotal: number;
  reviewsUsed: number;
  reviewsRemaining: number;
  interval: BillingInterval;
};

/**
 * Computes effective quota for an employer. Free tier = EMPLOYER_FREE_REVIEWS
 * (3) reviews, counted via employers.free_reviews_used. Paid tier = the
 * tier-configured reviews per period, counted via employers.reviews_remaining
 * (decremented on each candidate-action). The denormalised counter is
 * trusted on the paid path because there's exactly one write site
 * (employer.ts:candidateAction); no historic drift like the candidate
 * side had.
 */
export async function getEmployerQuota(e: {
  billingTier: EmployerBillingTier | null;
  stripeSubscriptionId: string | null;
  freeReviewsUsed: number;
  reviewsRemaining: number | null;
}): Promise<EmployerQuota> {
  let periodTotal = EMPLOYER_FREE_REVIEWS;
  let interval: BillingInterval = "week";
  if (e.billingTier && e.stripeSubscriptionId) {
    try {
      const sub = (await stripeClient().subscriptions.retrieve(
        e.stripeSubscriptionId,
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
      EMPLOYER_TIER_PLANS[e.billingTier]?.[interval]?.reviews ??
      EMPLOYER_TIER_PLANS[e.billingTier]?.week?.reviews ??
      EMPLOYER_FREE_REVIEWS;
    const reviewsRemaining = Math.max(0, e.reviewsRemaining ?? 0);
    const reviewsUsed = Math.max(0, periodTotal - reviewsRemaining);
    return { periodTotal, reviewsUsed, reviewsRemaining, interval };
  }
  const reviewsUsed = Math.max(0, e.freeReviewsUsed);
  const reviewsRemaining = Math.max(0, periodTotal - reviewsUsed);
  return { periodTotal, reviewsUsed, reviewsRemaining, interval };
}

/**
 * GET /api/billing/employer/me — employer billing state for the modal
 * + banner. Returns plan label, period_total, reviews_used,
 * reviews_remaining, hasSubscription, periodEnd.
 */
export async function billingEmployerMe(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureEmployerBillingSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const [e] = await db()
    .select()
    .from(employers)
    .where(eq(employers.firebaseUid, auth.uid))
    .limit(1);
  if (!e) {
    res.json({
      tier: null,
      status: null,
      reviewsRemaining: 0,
      reviewsUsed: 0,
      periodTotal: EMPLOYER_FREE_REVIEWS,
      interval: "week" as BillingInterval,
      periodEnd: null,
      hasSubscription: false,
    });
    return;
  }
  const quota = await getEmployerQuota({
    billingTier: e.billingTier,
    stripeSubscriptionId: e.stripeSubscriptionId,
    freeReviewsUsed: e.freeReviewsUsed,
    reviewsRemaining: e.reviewsRemaining,
  });
  res.json({
    tier: e.billingTier,
    status: e.billingStatus,
    reviewsRemaining: quota.reviewsRemaining,
    reviewsUsed: quota.reviewsUsed,
    periodTotal: quota.periodTotal,
    interval: quota.interval,
    periodEnd: e.billingPeriodEnd,
    hasSubscription: !!e.stripeSubscriptionId,
  });
}

/**
 * POST /api/billing/employer/checkout { tier, interval } — creates a
 * Stripe Checkout Session for the requested employer plan. Uses inline
 * price_data so no Stripe-side Product/Price pre-creation is needed —
 * the amounts in EMPLOYER_TIER_PLANS ARE the amounts charged. Returns
 * { url } for the front-end to redirect to.
 */
export async function billingEmployerCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureEmployerBillingSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const body = (req.body ?? {}) as { tier?: string; interval?: string };
  const tier = body.tier as EmployerBillingTier;
  const interval: BillingInterval = body.interval === "month" ? "month" : "week";
  const plan = EMPLOYER_TIER_PLANS[tier];
  if (!plan) {
    res.status(400).json({ error: "invalid tier" });
    return;
  }
  const priceConfig = plan[interval];

  const [e] = await db()
    .select()
    .from(employers)
    .where(eq(employers.firebaseUid, auth.uid))
    .limit(1);
  if (!e) {
    res.status(404).json({ error: "no employer row" });
    return;
  }

  const stripe = stripeClient();
  let customerId = e.stripeCustomerId;
  if (!customerId) {
    const cust = await stripe.customers.create({
      email: e.email ?? auth.email ?? undefined,
      name: e.company ?? undefined,
      metadata: { entityType: "employer", employerId: e.id },
    });
    customerId = cust.id;
    await db()
      .update(employers)
      .set({ stripeCustomerId: customerId })
      .where(eq(employers.id, e.id));
  }

  const origin = publicWebOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    allow_promotion_codes: true,
    success_url: `${origin}/dashboard/hiring?billing=success`,
    cancel_url: `${origin}/dashboard/hiring?billing=canceled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: priceConfig.amountCents,
          recurring: {
            interval: interval === "month" ? "month" : "week",
          },
          product_data: {
            name: plan.productName,
            metadata: { tier, interval },
          },
        },
      },
    ],
    metadata: {
      entityType: "employer",
      employerId: e.id,
      tier,
      interval,
    },
    subscription_data: {
      metadata: {
        entityType: "employer",
        employerId: e.id,
        tier,
        interval,
      },
    },
  });
  res.json({ url: session.url });
}

/**
 * POST /api/billing/employer/portal — Stripe Customer Portal for
 * employers to swap plans, update card, or cancel.
 */
export async function billingEmployerPortal(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureEmployerBillingSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const [e] = await db()
    .select({ stripeCustomerId: employers.stripeCustomerId })
    .from(employers)
    .where(eq(employers.firebaseUid, auth.uid))
    .limit(1);
  if (!e?.stripeCustomerId) {
    res.status(409).json({ error: "no stripe customer yet" });
    return;
  }
  const stripe = stripeClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: e.stripeCustomerId,
    return_url: `${publicWebOrigin()}/dashboard/hiring`,
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
  await ensureEmployerBillingSchema();
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
        const entityType = (s.metadata?.entityType ?? "candidate") as string;
        const interval = ((s.metadata?.interval ?? "week") as BillingInterval);
        const subId = (s.subscription as string) ?? null;
        let periodEnd: Date | null = null;
        if (subId) {
          const sub = (await stripeClient().subscriptions.retrieve(
            subId,
          )) as unknown as StripeSubscription;
          periodEnd = new Date((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0) * 1000);
        }

        if (entityType === "employer") {
          const employerId = (s.metadata?.employerId ?? "") as string;
          const tier = (s.metadata?.tier ?? "") as EmployerBillingTier;
          if (!employerId || !EMPLOYER_TIER_PLANS[tier]) break;
          const priceConfig =
            EMPLOYER_TIER_PLANS[tier][interval] ??
            EMPLOYER_TIER_PLANS[tier].week;
          await db()
            .update(employers)
            .set({
              stripeCustomerId: (s.customer as string) ?? undefined,
              stripeSubscriptionId: subId ?? undefined,
              billingTier: tier,
              billingStatus: "active",
              billingPeriodEnd: periodEnd,
              reviewsRemaining: priceConfig.reviews,
              reviewsResetAt: new Date(),
            })
            .where(eq(employers.id, employerId));
          console.log(
            `[stripe/webhook] checkout completed employer=${employerId} tier=${tier} interval=${interval} reviews=${priceConfig.reviews}`,
          );
          break;
        }

        // Candidate path (default for legacy sessions without entityType).
        const candidateId = (s.metadata?.candidateId ?? "") as string;
        const tier = (s.metadata?.tier ?? "") as CandidateBillingTier;
        if (!candidateId || !TIER_PLANS[tier]) break;
        const priceConfig =
          TIER_PLANS[tier][interval] ?? TIER_PLANS[tier].week;
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

        // Candidate sub renewal?
        const [c] = await db()
          .select({ id: candidates.id, billingTier: candidates.billingTier })
          .from(candidates)
          .where(eq(candidates.stripeSubscriptionId, subId))
          .limit(1);
        if (c?.billingTier) {
          const tierConfig = TIER_PLANS[c.billingTier];
          if (!tierConfig) break;
          const sub = (await stripeClient().subscriptions.retrieve(
            subId,
          )) as unknown as StripeSubscription;
          const periodEnd = new Date((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0) * 1000);
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

        // Employer sub renewal?
        const [emp] = await db()
          .select({ id: employers.id, billingTier: employers.billingTier })
          .from(employers)
          .where(eq(employers.stripeSubscriptionId, subId))
          .limit(1);
        if (emp?.billingTier) {
          const tierConfig = EMPLOYER_TIER_PLANS[emp.billingTier];
          if (!tierConfig) break;
          const sub = (await stripeClient().subscriptions.retrieve(
            subId,
          )) as unknown as StripeSubscription;
          const periodEnd = new Date((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0) * 1000);
          const items = (sub as unknown as { items?: { data: Array<{ price?: { id?: string; recurring?: { interval?: string } } }> } }).items;
          const intervalFromSub = items?.data?.[0]?.price?.recurring?.interval;
          const interval: BillingInterval =
            intervalFromSub === "month" ? "month" : "week";
          const priceConfig = tierConfig[interval] ?? tierConfig.week;
          await db()
            .update(employers)
            .set({
              billingStatus: "active",
              billingPeriodEnd: periodEnd,
              reviewsRemaining: priceConfig.reviews,
              reviewsResetAt: new Date(),
            })
            .where(eq(employers.id, emp.id));
          console.log(
            `[stripe/webhook] invoice.paid employer=${emp.id} interval=${interval} reset reviews=${priceConfig.reviews}`,
          );
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeSubscription;
        const periodEnd =
          (sub.current_period_end ??
            sub.items?.data?.[0]?.current_period_end ??
            0)
            ? new Date(
                (sub.current_period_end ??
                  sub.items?.data?.[0]?.current_period_end ??
                  0) * 1000,
              )
            : null;

        const [c] = await db()
          .select({ id: candidates.id })
          .from(candidates)
          .where(eq(candidates.stripeSubscriptionId, sub.id))
          .limit(1);
        if (c) {
          await db()
            .update(candidates)
            .set({ billingStatus: sub.status, billingPeriodEnd: periodEnd })
            .where(eq(candidates.id, c.id));
          console.log(
            `[stripe/webhook] sub ${event.type} candidate=${c.id} status=${sub.status}`,
          );
          break;
        }

        const [emp] = await db()
          .select({ id: employers.id })
          .from(employers)
          .where(eq(employers.stripeSubscriptionId, sub.id))
          .limit(1);
        if (emp) {
          await db()
            .update(employers)
            .set({ billingStatus: sub.status, billingPeriodEnd: periodEnd })
            .where(eq(employers.id, emp.id));
          console.log(
            `[stripe/webhook] sub ${event.type} employer=${emp.id} status=${sub.status}`,
          );
        }
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
