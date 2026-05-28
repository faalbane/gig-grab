/**
 * One-off: create 3 employer Products × 2 recurring intervals (week
 * + month) in Stripe, idempotent via `lookup_key`. Run from the
 * functions/ directory:
 *
 *   STRIPE_SECRET_KEY=$(gcloud secrets versions access latest \
 *     --secret=STRIPE_SECRET_KEY --project=gig-grab) \
 *     npx tsx scripts/create-employer-stripe-prices.ts
 *
 * Prints a paste-ready snippet to update EMPLOYER_TIER_PLANS in
 * functions/src/billing.ts. Safe to re-run — lookup_key on each Price
 * means Stripe returns the existing one instead of creating duplicates.
 */

import Stripe from "stripe";

type Tier = "lite" | "pro" | "scale";
type Interval = "week" | "month";

const PLANS: Array<{
  tier: Tier;
  productName: string;
  description: string;
  prices: Record<Interval, { amountCents: number; reviews: number }>;
}> = [
  {
    tier: "lite",
    productName: "GigGrab Hiring Lite",
    description: "Light hiring — single role or two. 25 reviews/wk · 100/mo.",
    prices: {
      week: { amountCents: 9900, reviews: 25 },
      month: { amountCents: 29900, reviews: 100 },
    },
  },
  {
    tier: "pro",
    productName: "GigGrab Hiring Pro",
    description: "Active hiring across multiple roles. 100 reviews/wk · 400/mo.",
    prices: {
      week: { amountCents: 24900, reviews: 100 },
      month: { amountCents: 74900, reviews: 400 },
    },
  },
  {
    tier: "scale",
    productName: "GigGrab Hiring Scale",
    description: "Volume / staffing-agency tier. Unlimited reviews.",
    prices: {
      week: { amountCents: 49900, reviews: 999999 },
      month: { amountCents: 149900, reviews: 999999 },
    },
  },
];

function lookupKey(tier: Tier, interval: Interval): string {
  return `giggrab_employer_${tier}_${interval}_v1`;
}

async function upsertProduct(
  stripe: Stripe,
  tier: Tier,
  name: string,
  description: string,
): Promise<Stripe.Product> {
  // Use a stable lookup field via metadata.tier — Stripe's products.search
  // requires the search-API addon. Fall back to list + filter.
  const existing = await stripe.products.list({ limit: 100, active: true });
  const match = existing.data.find((p) => p.metadata?.employer_tier === tier);
  if (match) {
    return match;
  }
  const created = await stripe.products.create({
    name,
    description,
    metadata: { employer_tier: tier, entityType: "employer" },
  });
  return created;
}

async function upsertPrice(
  stripe: Stripe,
  productId: string,
  tier: Tier,
  interval: Interval,
  amountCents: number,
  reviews: number,
): Promise<Stripe.Price> {
  const lk = lookupKey(tier, interval);
  const found = await stripe.prices.list({
    lookup_keys: [lk],
    active: true,
    limit: 1,
    expand: ["data.product"],
  });
  if (found.data[0]) {
    return found.data[0];
  }
  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: amountCents,
    recurring: { interval },
    lookup_key: lk,
    metadata: {
      employer_tier: tier,
      employer_interval: interval,
      reviews: String(reviews),
    },
  });
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY env var not set");
  }
  const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" as Stripe.LatestApiVersion });

  console.log("# Creating / verifying GigGrab employer Products + Prices ...");
  const ids: Record<Tier, Record<Interval, string>> = {
    lite: { week: "", month: "" },
    pro: { week: "", month: "" },
    scale: { week: "", month: "" },
  };

  for (const plan of PLANS) {
    const product = await upsertProduct(
      stripe,
      plan.tier,
      plan.productName,
      plan.description,
    );
    console.log(`  ${plan.productName.padEnd(25)} product=${product.id}`);
    for (const interval of ["week", "month"] as Interval[]) {
      const cfg = plan.prices[interval];
      const price = await upsertPrice(
        stripe,
        product.id,
        plan.tier,
        interval,
        cfg.amountCents,
        cfg.reviews,
      );
      ids[plan.tier][interval] = price.id;
      console.log(
        `    ${interval.padEnd(5)} $${(cfg.amountCents / 100).toFixed(2).padEnd(8)} price=${price.id}  lookup=${lookupKey(plan.tier, interval)}`,
      );
    }
  }

  console.log("");
  console.log("# Paste into functions/src/billing.ts EMPLOYER_TIER_PLANS:");
  console.log("");
  for (const tier of ["lite", "pro", "scale"] as Tier[]) {
    console.log(`  ${tier}: {`);
    for (const interval of ["week", "month"] as Interval[]) {
      console.log(`    ${interval}: { priceId: "${ids[tier][interval]}", ... },`);
    }
    console.log(`  },`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
