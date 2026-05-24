"use client";

/**
 * PaywallModal — first-time dashboard pop-up.
 *
 * Triggered once per browser for free-tier users on dashboard mount.
 * Shows the 3 paid plans + weekly/monthly toggle + a "Continue with
 * 10 free applications" escape. Plan-select hits the same Stripe
 * Checkout endpoint /api/billing/checkout the /pricing page uses,
 * so the post-checkout flow (return URL, webhook, dashboard) is
 * unchanged.
 *
 * Dismiss persistence: localStorage `gg.paywallSeen` = "1" on close.
 * Won't re-pop on subsequent visits for the same browser.
 */

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/firebase";
import { track } from "@/components/PostHogProvider";

type Tier = "starter" | "professional" | "premium";
type Interval = "week" | "month";

type Plan = {
  tier: Tier;
  label: string;
  blurb: string;
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
    prices: {
      week: { amount: "$9.99", applications: 20 },
      month: { amount: "$19.99", applications: 80, saveLabel: "Save 50%" },
    },
  },
  {
    tier: "professional",
    label: "Professional",
    blurb: "Active job seekers ready to move fast.",
    featured: true,
    prices: {
      week: { amount: "$19.99", applications: 50 },
      month: { amount: "$29.99", applications: 150 },
    },
  },
  {
    tier: "premium",
    label: "Premium",
    blurb: "Go-getters ready to land their next role.",
    prices: {
      week: { amount: "$29.99", applications: 100 },
      month: { amount: "$49.99", applications: 300, saveLabel: "Save 58%" },
    },
  },
];

const FEATURES: string[] = [
  "Auto-apply to jobs",
  "Smart job matching",
  "Application tracking",
  "Email notifications",
  "Resume optimization",
  "Cover letter generation",
];

export const PAYWALL_SEEN_KEY = "gg.paywallSeen";

export function PaywallModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [interval, setInterval] = useState<Interval>("week");
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    track("paywall_modal_shown", {});
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  async function subscribe(tier: Tier) {
    setBusyTier(tier);
    setErr(null);
    try {
      const { url } = await fetchWithAuth<{ url: string }>(
        "/api/billing/checkout",
        { method: "POST", body: JSON.stringify({ tier, interval }) },
      );
      track("paywall_modal_checkout", { tier, interval });
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start checkout.");
      setBusyTier(null);
    }
  }

  function dismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(PAYWALL_SEEN_KEY, "1");
    }
    track("paywall_modal_dismissed", {});
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8 sm:py-12"
      style={{ background: "rgba(11, 22, 18, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border bg-white p-6 shadow-2xl sm:p-8"
        style={{ borderColor: "var(--gg-line)" }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-md p-1.5 text-xl leading-none hover:bg-gray-100"
          style={{ color: "var(--gg-muted)" }}
        >
          ×
        </button>

        <header className="mb-5 text-center">
          <p
            className="mono text-[10px] font-semibold uppercase"
            style={{
              color: "var(--gg-green-dark)",
              letterSpacing: "0.14em",
            }}
          >
            Pick a plan to get started
          </p>
          <h2
            id="paywall-title"
            className="m-0 mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]"
            style={{ color: "var(--gg-ink)" }}
          >
            Apply to more jobs, faster.
          </h2>
          <p
            className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
            style={{ color: "var(--gg-muted)" }}
          >
            Each plan gives you a fixed number of applications per period.
            Cancel anytime.
          </p>
        </header>

        <div className="mb-4 flex items-center justify-center">
          <div
            className="inline-flex rounded-xl border p-1"
            style={{ background: "var(--gg-bg)", borderColor: "var(--gg-line)" }}
          >
            <IntervalButton
              active={interval === "week"}
              onClick={() => setInterval("week")}
              label="Weekly"
            />
            <IntervalButton
              active={interval === "month"}
              onClick={() => setInterval("month")}
              label="Monthly"
              pill="Save up to 62%"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard
              key={p.tier}
              plan={p}
              interval={interval}
              busy={busyTier === p.tier}
              anyBusy={busyTier !== null}
              onPick={() => subscribe(p.tier)}
            />
          ))}
        </div>

        {err && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </p>
        )}

        <div
          className="mt-5 rounded-xl border p-4"
          style={{ background: "var(--gg-bg)", borderColor: "var(--gg-line)" }}
        >
          <p
            className="mono text-[10px] font-semibold uppercase"
            style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
          >
            All plans include
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-1.5"
                style={{ color: "var(--gg-ink-2)" }}
              >
                <span
                  aria-hidden
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm underline"
            style={{ color: "var(--gg-muted)" }}
          >
            Continue with 10 free applications
          </button>
        </div>
      </div>
    </div>
  );
}

function IntervalButton({
  active,
  onClick,
  label,
  pill,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  pill?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors"
      style={{
        background: active ? "var(--gg-ink)" : "transparent",
        color: active ? "white" : "var(--gg-ink-2)",
      }}
    >
      {label}
      {pill && (
        <span
          className="ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{
            background: active ? "var(--gg-green-tint)" : "var(--gg-green-tint)",
            color: "var(--gg-green-dark)",
          }}
        >
          {pill}
        </span>
      )}
    </button>
  );
}

function PlanCard({
  plan,
  interval,
  busy,
  anyBusy,
  onPick,
}: {
  plan: Plan;
  interval: Interval;
  busy: boolean;
  anyBusy: boolean;
  onPick: () => void;
}) {
  const price = plan.prices[interval];
  const periodLabel = interval === "week" ? "/wk" : "/mo";
  return (
    <article
      className="relative flex flex-col rounded-xl border bg-white p-4"
      style={{
        borderColor: plan.featured ? "var(--gg-green-dark)" : "var(--gg-line)",
        boxShadow: plan.featured
          ? "0 0 0 2px var(--gg-green-tint)"
          : undefined,
      }}
    >
      {plan.featured && (
        <span
          className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: "var(--gg-green-dark)",
            color: "white",
            letterSpacing: "0.08em",
          }}
        >
          Most popular
        </span>
      )}
      {interval === "month" && plan.prices.month.saveLabel && (
        <span
          className="absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={{
            background: "var(--gg-green-tint)",
            color: "var(--gg-green-dark)",
            letterSpacing: "0.08em",
          }}
        >
          {plan.prices.month.saveLabel}
        </span>
      )}
      <h3
        className="m-0 text-base font-extrabold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {plan.label}
      </h3>
      <p
        className="m-0 mt-0.5 text-xs leading-snug"
        style={{ color: "var(--gg-muted)" }}
      >
        {plan.blurb}
      </p>
      <div className="mt-3 flex items-baseline gap-1">
        <span
          className="text-2xl font-extrabold tracking-tight"
          style={{ color: "var(--gg-ink)" }}
        >
          {price.amount}
        </span>
        <span className="text-xs" style={{ color: "var(--gg-muted)" }}>
          {periodLabel}
        </span>
      </div>
      <p
        className="mt-1 text-xs font-semibold"
        style={{ color: "var(--gg-ink-2)" }}
      >
        {price.applications} applications
      </p>
      <button
        type="button"
        onClick={onPick}
        disabled={anyBusy}
        className="mt-4 w-full rounded-md px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
        style={{
          background: plan.featured ? "var(--gg-green-dark)" : "var(--gg-ink)",
        }}
      >
        {busy ? "Starting…" : "Choose plan"}
      </button>
    </article>
  );
}
