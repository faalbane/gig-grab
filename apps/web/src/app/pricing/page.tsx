"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { useAuthUser, fetchWithAuth } from "@/lib/firebase";
import { track } from "@/components/PostHogProvider";

type Tier = "starter" | "professional" | "premium";
type Interval = "week" | "month";

type Plan = {
  tier: Tier;
  label: string;
  blurb: string;
  description: string;
  featured?: boolean;
  prices: {
    week: { amount: string; applications: number };
    month: { amount: string; applications: number; saveLabel?: string };
  };
};

const PLANS: Plan[] = [
  {
    tier: "starter",
    label: "Starter",
    blurb: "For light job seekers testing the market.",
    description:
      "Perfect if you're applying occasionally or exploring new roles.",
    prices: {
      week: { amount: "$9.99", applications: 20 },
      month: { amount: "$19.99", applications: 80, saveLabel: "Save 50%" },
    },
  },
  {
    tier: "professional",
    label: "Professional",
    blurb: "For active job seekers ready to move fast.",
    description:
      "Ideal if you're applying weekly and want to stay top of mind with every opportunity.",
    featured: true,
    prices: {
      week: { amount: "$19.99", applications: 50 },
      month: { amount: "$29.99", applications: 150 },
    },
  },
  {
    tier: "premium",
    label: "Premium",
    blurb: "For go-getters ready to land their next role.",
    description:
      "Go all in. Apply to more roles, faster — and let us handle the busywork.",
    prices: {
      week: { amount: "$29.99", applications: 100 },
      month: { amount: "$49.99", applications: 300, saveLabel: "Save 58%" },
    },
  },
];

const FEATURES: Array<{ title: string; body: string }> = [
  { title: "Auto-apply to jobs", body: "Let us handle the applications for you" },
  { title: "Smart job matching", body: "AI-powered matching to relevant roles" },
  { title: "Application tracking", body: "See every application you've sent" },
  { title: "Email notifications", body: "Stay updated on application status" },
  { title: "Resume optimization", body: "Tailored for each application" },
  { title: "Cover letter generation", body: "Custom cover letters for every job" },
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
  const [interval, setInterval] = useState<Interval>("week");
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canceledBanner = params.get("billing") === "canceled";
  const quotaBanner = params.get("billing") === "quota_exceeded";

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
        { method: "POST", body: JSON.stringify({ tier, interval }) },
      );
      track("billing_checkout_started", { tier, interval });
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
    <main
      className="mx-auto max-w-5xl px-6 py-12 sm:py-16"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, var(--gg-green-tint-2) 0%, transparent 45%), var(--gg-bg)",
      }}
    >
      <header className="mb-8 text-center">
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
          Pick a plan.
        </h1>
        <p
          className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed"
          style={{ color: "var(--gg-muted)" }}
        >
          Each plan gives you a fixed number of applications per period.
          Cancel anytime.
        </p>
      </header>

      <IntervalToggle value={interval} onChange={setInterval} />

      <FreeBanner />

      {canceledBanner && (
        <Banner tone="warn" text="Checkout was canceled. No charge applied." />
      )}
      {quotaBanner && (
        <Banner
          tone="warn"
          text="You're out of free applications — pick a plan to keep going."
        />
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
              {me.applicationsRemaining} applications left this period
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

      <div className="mt-2 grid gap-5 sm:grid-cols-3">
        {PLANS.map((p) => {
          const priceCfg = p.prices[interval];
          const isCurrent = me?.tier === p.tier && !!me?.hasSubscription;
          const featured = !!p.featured && !isCurrent;
          return (
            <PlanCard
              key={p.tier}
              plan={p}
              priceCfg={priceCfg}
              interval={interval}
              featured={featured}
              isCurrent={isCurrent}
              busy={busyTier === p.tier}
              onSubscribe={() => subscribe(p.tier)}
            />
          );
        })}
      </div>

      <section className="mt-16">
        <header className="mb-6 text-center">
          <h2
            className="m-0 text-2xl font-extrabold tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            All features included in every plan
          </h2>
          <p
            className="mx-auto mt-2 max-w-2xl text-sm"
            style={{ color: "var(--gg-muted)" }}
          >
            No upsells. No paywalls — just everything you need to apply
            better and move forward.
          </p>
        </header>
        <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <FeatureRow key={f.title} title={f.title} body={f.body} />
          ))}
        </div>
      </section>

      <div
        className="-mx-6 mt-16 border-t bg-white px-6 py-8 text-center"
        style={{ borderColor: "var(--gg-line)" }}
      >
        <p className="m-0 text-sm" style={{ color: "var(--gg-ink-2)" }}>
          Questions about pricing? Contact our team for personalized assistance.
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--gg-muted)" }}>
          <a
            href={`mailto:hello@giggrab.io`}
            className="underline"
            style={{ color: "var(--gg-green-dark)" }}
          >
            hello@giggrab.io
          </a>
        </p>
      </div>

      {!user && (
        <p className="mt-6 text-center text-sm">
          <Link href="/auth?returnTo=/pricing" className="underline">
            Sign in
          </Link>{" "}
          to subscribe.
        </p>
      )}
    </main>
  );
}

function IntervalToggle({
  value,
  onChange,
}: {
  value: Interval;
  onChange: (v: Interval) => void;
}) {
  return (
    <div className="mx-auto mb-6 flex justify-center">
      <div
        className="inline-flex rounded-xl border p-1"
        style={{
          background: "var(--gg-bg, #fff)",
          borderColor: "var(--gg-line)",
        }}
      >
        <ToggleBtn
          active={value === "week"}
          onClick={() => onChange("week")}
          label="Weekly"
        />
        <ToggleBtn
          active={value === "month"}
          onClick={() => onChange("month")}
          label="Monthly"
          badge="Save up to 62%"
        />
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all"
      style={{
        background: active ? "white" : "transparent",
        color: active ? "var(--gg-ink)" : "var(--gg-muted)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
      }}
    >
      {label}
      {badge && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: "var(--gg-green-tint-2)",
            color: "var(--gg-green-deep)",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function FreeBanner() {
  return (
    <div
      className="mx-auto mb-7 max-w-3xl rounded-xl border p-4 sm:p-5"
      style={{
        background: "var(--gg-green-tint-2)",
        borderColor: "var(--gg-green-tint)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full"
          style={{ background: "var(--gg-green-dark)", color: "white" }}
        >
          ✓
        </span>
        <div>
          <p
            className="m-0 text-sm font-bold"
            style={{ color: "var(--gg-green-deep)" }}
          >
            Start Free
          </p>
          <p
            className="m-0 mt-0.5 text-sm leading-relaxed"
            style={{ color: "var(--gg-ink-2)" }}
          >
            Get 10 free auto-applications to try our service. No credit
            card required. Upgrade anytime to unlock more applications.
          </p>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  priceCfg,
  interval,
  featured,
  isCurrent,
  busy,
  onSubscribe,
}: {
  plan: Plan;
  priceCfg: { amount: string; applications: number; saveLabel?: string };
  interval: Interval;
  featured: boolean;
  isCurrent: boolean;
  busy: boolean;
  onSubscribe: () => void;
}) {
  return (
    <article
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
      {priceCfg.saveLabel && !featured && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase"
          style={{
            background: "var(--gg-green-tint-2)",
            color: "var(--gg-green-deep)",
            letterSpacing: "0.08em",
          }}
        >
          {priceCfg.saveLabel}
        </span>
      )}
      <h3
        className="m-0 text-lg font-bold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {plan.label}
      </h3>
      <p className="mt-1 text-sm" style={{ color: "var(--gg-muted)" }}>
        {plan.blurb}
      </p>
      <p
        className="mt-5 text-3xl font-extrabold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {priceCfg.amount}
        <span
          className="ml-1 text-sm font-medium"
          style={{ color: "var(--gg-muted)" }}
        >
          /{interval === "week" ? "week" : "month"}
        </span>
      </p>
      <p
        className="mt-2 text-sm font-semibold"
        style={{ color: "var(--gg-green-dark)" }}
      >
        {priceCfg.applications} applications /{" "}
        {interval === "week" ? "week" : "month"}
      </p>
      <p
        className="mt-3 rounded-md p-3 text-xs"
        style={{
          background: "var(--gg-bg, #F8FAF9)",
          color: "var(--gg-ink-2)",
        }}
      >
        {plan.description}
      </p>
      <button
        type="button"
        onClick={onSubscribe}
        disabled={busy || isCurrent}
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
        {isCurrent ? "Current plan" : busy ? "Loading…" : "Get Started"}
      </button>
    </article>
  );
}

function FeatureRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-1 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold"
        style={{ background: "var(--gg-green-tint-2)", color: "var(--gg-green-dark)" }}
      >
        ✓
      </span>
      <div>
        <p
          className="m-0 text-sm font-semibold"
          style={{ color: "var(--gg-ink)" }}
        >
          {title}
        </p>
        <p className="m-0 text-xs" style={{ color: "var(--gg-muted)" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function Banner({ tone, text }: { tone: "warn" | "info"; text: string }) {
  const bg = tone === "warn" ? "#FEF3C7" : "var(--gg-green-tint-2)";
  const color = tone === "warn" ? "#92400E" : "var(--gg-green-deep)";
  return (
    <div
      className="mx-auto mb-6 max-w-2xl rounded-lg px-4 py-2 text-center text-sm"
      style={{ background: bg, color }}
    >
      {text}
    </div>
  );
}
