"use client";

/**
 * EmployerWelcomeModal — first-time pop on the employer hiring
 * dashboard. Combines the 3-free-reviews framing with three paid
 * Stripe plans (Hiring Lite / Pro / Scale) using inline price_data
 * (no pre-created Stripe Products). Also exposes a "Talk to us"
 * escape that opens the existing CallbackModal for the placement-
 * contract path.
 *
 * Dismiss persistence: localStorage `gg.employerWelcomeSeen` = "1".
 */

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/firebase";
import { track } from "@/components/PostHogProvider";

export const EMPLOYER_WELCOME_SEEN_KEY = "gg.employerWelcomeSeen";

type Tier = "lite" | "pro" | "scale";
type Interval = "week" | "month";

type EmployerPlan = {
  tier: Tier;
  label: string;
  blurb: string;
  featured?: boolean;
  prices: {
    week: { amount: string; reviews: string };
    month: { amount: string; reviews: string; saveLabel?: string };
  };
};

// MIRRORS functions/src/billing.ts EMPLOYER_TIER_PLANS. Edit there
// to change actual charged amounts; this is display-only copy.
const EMPLOYER_PLANS: EmployerPlan[] = [
  {
    tier: "lite",
    label: "Hiring Lite",
    blurb: "Light hiring, single role or two.",
    prices: {
      week: { amount: "$99", reviews: "25 candidate reviews" },
      month: { amount: "$299", reviews: "100 reviews", saveLabel: "Save 25%" },
    },
  },
  {
    tier: "pro",
    label: "Hiring Pro",
    blurb: "Active hiring, multiple roles.",
    featured: true,
    prices: {
      week: { amount: "$249", reviews: "100 candidate reviews" },
      month: { amount: "$749", reviews: "400 reviews", saveLabel: "Save 25%" },
    },
  },
  {
    tier: "scale",
    label: "Hiring Scale",
    blurb: "Volume hiring or staffing agency.",
    prices: {
      week: { amount: "$499", reviews: "Unlimited reviews" },
      month: { amount: "$1,499", reviews: "Unlimited", saveLabel: "Save 25%" },
    },
  },
];

const FEATURES: string[] = [
  "Voice-vetted candidates",
  "AI shortlisting & rationale",
  "Application status tracking",
  "Interview request flow",
  "Unlimited active jobs",
  "Cancel anytime",
];

export function EmployerWelcomeModal({
  open,
  freeReviewsLimit,
  onClose,
  onTalkToUs,
}: {
  open: boolean;
  freeReviewsLimit: number;
  onClose: () => void;
  onTalkToUs: () => void;
}) {
  const [interval, setInterval] = useState<Interval>("month");
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    track("employer_welcome_modal_shown", {});
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
        "/api/billing/employer/checkout",
        { method: "POST", body: JSON.stringify({ tier, interval }) },
      );
      track("employer_paywall_modal_checkout", { tier, interval });
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start checkout.");
      setBusyTier(null);
    }
  }

  function dismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(EMPLOYER_WELCOME_SEEN_KEY, "1");
    }
    track("employer_welcome_modal_dismissed", {});
    onClose();
  }

  function talkToUs() {
    if (typeof window !== "undefined") {
      localStorage.setItem(EMPLOYER_WELCOME_SEEN_KEY, "1");
    }
    track("employer_welcome_modal_talk", {});
    onClose();
    onTalkToUs();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8 sm:py-12"
      style={{ background: "rgba(11, 22, 18, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="employer-welcome-title"
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
            Pick a hiring plan
          </p>
          <h2
            id="employer-welcome-title"
            className="m-0 mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]"
            style={{ color: "var(--gg-ink)" }}
          >
            Hire faster, with vetted candidates.
          </h2>
          <p
            className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
            style={{ color: "var(--gg-muted)" }}
          >
            Start with {freeReviewsLimit} free candidate reviews. Upgrade
            anytime for higher volume and unlimited jobs. Cancel anytime.
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
              pill="Save 25%"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {EMPLOYER_PLANS.map((p) => (
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
                <span aria-hidden style={{ color: "var(--gg-green-dark)" }}>
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm underline"
            style={{ color: "var(--gg-muted)" }}
          >
            Continue with {freeReviewsLimit} free reviews
          </button>
          <button
            type="button"
            onClick={talkToUs}
            className="text-xs"
            style={{ color: "var(--gg-muted)" }}
          >
            Or talk to us about a custom placement contract →
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
            background: "var(--gg-green-tint)",
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
  plan: EmployerPlan;
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
        boxShadow: plan.featured ? "0 0 0 2px var(--gg-green-tint)" : undefined,
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
        {price.reviews}
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
