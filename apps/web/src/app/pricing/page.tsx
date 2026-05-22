"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { useAuthUser, fetchWithAuth } from "@/lib/firebase";
import { track } from "@/components/PostHogProvider";

type Tier = "starter" | "professional" | "premium";

type Plan = {
  tier: Tier;
  label: string;
  blurb: string;
  priceText: string;
  applications: number;
  description: string;
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    tier: "starter",
    label: "Starter",
    blurb: "For light job seekers testing the market.",
    priceText: "$9.99",
    applications: 20,
    description:
      "Perfect if you're applying occasionally or exploring new roles.",
  },
  {
    tier: "professional",
    label: "Professional",
    blurb: "For active job seekers ready to move fast.",
    priceText: "$19.99",
    applications: 50,
    description:
      "Ideal if you're applying weekly and want to stay top of mind with every opportunity.",
    featured: true,
  },
  {
    tier: "premium",
    label: "Premium",
    blurb: "For go-getters ready to land their next role.",
    priceText: "$29.99",
    applications: 100,
    description:
      "Go all in. Apply to more roles, faster — and let us handle the busywork.",
  },
];

type BillingMe = {
  tier: Tier | null;
  status: string | null;
  applicationsRemaining: number;
  hasSubscription: boolean;
};

export default function PricingPage() {
  return (
    <>
      <Header />
      <Suspense
        fallback={
          <div className="px-6 py-20 text-center text-gray-400">Loading…</div>
        }
      >
        <PricingInner />
      </Suspense>
      <Footer />
    </>
  );
}

function PricingInner() {
  const params = useSearchParams();
  const user = useAuthUser();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canceledBanner = params.get("billing") === "canceled";

  useEffect(() => {
    if (user === null || user === false) {
      setMe(null);
      return;
    }
    fetchWithAuth<BillingMe>("/api/billing/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, [user]);

  async function subscribe(tier: Tier) {
    if (user === false) {
      window.location.href = `/auth?returnTo=/pricing`;
      return;
    }
    if (user === null) return;
    setBusyTier(tier);
    setErr(null);
    try {
      const { url } = await fetchWithAuth<{ url: string }>(
        "/api/billing/checkout",
        { method: "POST", body: JSON.stringify({ tier }) },
      );
      track("billing_checkout_started", { tier });
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start checkout.");
      setBusyTier(null);
    }
  }

  async function openPortal() {
    setErr(null);
    try {
      const { url } = await fetchWithAuth<{ url: string }>(
        "/api/billing/portal",
        { method: "POST", body: JSON.stringify({}) },
      );
      track("billing_portal_opened", {});
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open portal.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <header className="mb-10 text-center">
        <p
          className="mono text-xs font-semibold uppercase"
          style={{
            color: "var(--gg-green-dark)",
            letterSpacing: "0.14em",
          }}
        >
          Pricing
        </p>
        <h1
          className="m-0 mt-2 text-3xl font-extrabold tracking-tight sm:text-[40px]"
          style={{ color: "var(--gg-ink)" }}
        >
          Pick a weekly plan.
        </h1>
        <p
          className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed"
          style={{ color: "var(--gg-muted)" }}
        >
          Each plan gives you a fixed number of applications per week.
          Cancel anytime from your dashboard.
        </p>
      </header>

      {canceledBanner && (
        <div
          className="mx-auto mb-6 max-w-2xl rounded-lg px-4 py-2 text-center text-sm"
          style={{ background: "#FEF3C7", color: "#92400E" }}
        >
          Checkout was canceled. No charge applied.
        </div>
      )}

      {me?.hasSubscription && (
        <div
          className="mx-auto mb-6 flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"
          style={{ borderColor: "var(--gg-line)" }}
        >
          <div className="text-sm">
            <p className="m-0 font-semibold" style={{ color: "var(--gg-ink)" }}>
              You&apos;re on <span className="capitalize">{me.tier}</span> —{" "}
              {me.status}
            </p>
            <p className="m-0 text-xs" style={{ color: "var(--gg-muted)" }}>
              {me.applicationsRemaining} applications left this week
            </p>
          </div>
          <button
            type="button"
            onClick={openPortal}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:border-gray-400"
          >
            Manage subscription
          </button>
        </div>
      )}

      {err && (
        <p className="mx-auto mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-700">
          {err}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = me?.tier === p.tier && !!me?.hasSubscription;
          const featured = p.featured && !isCurrent;
          return (
            <article
              key={p.tier}
              className="relative rounded-2xl border bg-white p-6"
              style={{
                borderColor: featured ? "var(--gg-green-dark)" : "var(--gg-line)",
                boxShadow: featured
                  ? "0 20px 60px -25px rgba(14,40,22,0.25)"
                  : undefined,
              }}
            >
              {featured && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase text-white"
                  style={{
                    background: "var(--gg-green-dark)",
                    letterSpacing: "0.08em",
                  }}
                >
                  Most Popular
                </span>
              )}
              <h3
                className="m-0 text-lg font-bold tracking-tight"
                style={{ color: "var(--gg-ink)" }}
              >
                {p.label}
              </h3>
              <p className="mt-1 text-sm" style={{ color: "var(--gg-muted)" }}>
                {p.blurb}
              </p>
              <p
                className="mt-5 text-3xl font-extrabold tracking-tight"
                style={{ color: "var(--gg-ink)" }}
              >
                {p.priceText}
                <span
                  className="ml-1 text-sm font-medium"
                  style={{ color: "var(--gg-muted)" }}
                >
                  /week
                </span>
              </p>
              <p
                className="mt-2 text-sm font-semibold"
                style={{ color: "var(--gg-green-dark)" }}
              >
                {p.applications} applications / week
              </p>
              <p
                className="mt-3 rounded-md p-3 text-xs"
                style={{
                  background: "var(--gg-bg, #F8FAF9)",
                  color: "var(--gg-ink-2)",
                }}
              >
                {p.description}
              </p>
              <button
                type="button"
                onClick={() => subscribe(p.tier)}
                disabled={busyTier === p.tier || isCurrent}
                className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-bold ${
                  isCurrent ? "bg-gray-100 text-gray-500" : "text-white"
                } disabled:opacity-60`}
                style={
                  isCurrent
                    ? undefined
                    : {
                        background: featured
                          ? "var(--gg-green-dark)"
                          : "var(--gg-ink)",
                      }
                }
              >
                {isCurrent
                  ? "Current plan"
                  : busyTier === p.tier
                    ? "Loading…"
                    : "Get Started"}
              </button>
            </article>
          );
        })}
      </div>

      <p
        className="mt-10 text-center text-xs"
        style={{ color: "var(--gg-muted)" }}
      >
        Subscriptions auto-renew weekly. Cancel anytime from the Stripe
        Customer Portal.
      </p>

      {!user && (
        <p className="mt-4 text-center text-sm">
          <Link href="/auth?returnTo=/pricing" className="underline">
            Sign in
          </Link>{" "}
          to subscribe.
        </p>
      )}
    </main>
  );
}
