"use client";

/**
 * Candidate-side billing summary. Lives at the top of /dashboard and
 * inside /settings. Shows the active plan + applications remaining
 * for subscribed users; nudges /pricing for free-tier users when
 * they have few or zero applications left.
 *
 * Manage button opens the Stripe Customer Portal so users can swap
 * plans, update card, or cancel.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithAuth, useAuthUser } from "@/lib/firebase";
import { track } from "@/components/PostHogProvider";

type BillingMe = {
  tier: "starter" | "professional" | "premium" | null;
  status: string | null;
  applicationsRemaining: number;
  applicationsUsed: number;
  periodTotal: number;
  interval?: "week" | "month";
  periodEnd: string | null;
  hasSubscription: boolean;
};

const TIER_LABEL: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  premium: "Premium",
};

export function BillingBanner({
  variant = "compact",
  showSuccessFromQuery = false,
  onUpgrade,
}: {
  variant?: "compact" | "card";
  showSuccessFromQuery?: boolean;
  /**
   * Optional click handler for the Upgrade / Pick-a-plan CTA. When
   * provided (e.g. by /dashboard), the button opens the PaywallModal
   * in place instead of routing to /pricing. When omitted (e.g.
   * /settings), the button falls back to a Link to /pricing.
   */
  onUpgrade?: () => void;
}) {
  const user = useAuthUser();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user === null || user === false) return;
    fetchWithAuth<BillingMe>("/api/billing/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, [user]);

  const successFlag =
    showSuccessFromQuery &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("billing") === "success";

  async function openPortal() {
    setBusy(true);
    setErr(null);
    try {
      const { url } = await fetchWithAuth<{ url: string }>(
        "/api/billing/portal",
        { method: "POST", body: JSON.stringify({}) },
      );
      track("billing_portal_opened", { from: variant });
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open billing portal.");
      setBusy(false);
    }
  }

  if (user === null || user === false || me === null) return null;

  if (me.hasSubscription && me.tier) {
    return (
      <Container variant={variant}>
        {successFlag && (
          <p
            className="m-0 mb-2 text-xs font-bold"
            style={{ color: "var(--gg-green-deep)" }}
          >
            ✓ Subscription active — welcome to {TIER_LABEL[me.tier]}!
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p
              className="m-0 font-bold tracking-tight"
              style={{ color: "var(--gg-ink)" }}
            >
              {TIER_LABEL[me.tier]} plan
              <span
                className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{
                  background:
                    me.status === "active"
                      ? "var(--gg-green-tint-2)"
                      : "#FEF3C7",
                  color:
                    me.status === "active"
                      ? "var(--gg-green-deep)"
                      : "#92400E",
                }}
              >
                {me.status}
              </span>
            </p>
            <p
              className="m-0 mt-0.5 text-xs"
              style={{ color: "var(--gg-muted)" }}
            >
              {me.applicationsUsed} of {me.periodTotal} applications used
              {me.periodEnd
                ? ` · renews ${new Date(me.periodEnd).toLocaleDateString()}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={openPortal}
            disabled={busy}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold hover:border-gray-400 disabled:opacity-60"
          >
            {busy ? "Opening…" : "Manage subscription"}
          </button>
        </div>
        {err && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {err}
          </p>
        )}
      </Container>
    );
  }

  // Free tier
  const low = me.applicationsRemaining <= 3;
  const empty = me.applicationsRemaining <= 0;
  return (
    <Container variant={variant} tone={empty ? "warn" : low ? "info" : "neutral"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p
            className="m-0 font-bold tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            Free tier
          </p>
          <p
            className="m-0 mt-0.5 text-xs"
            style={{ color: empty ? "#92400E" : "var(--gg-muted)" }}
          >
            {empty
              ? "Out of free applications. Pick a plan to keep applying."
              : `${me.applicationsUsed} of ${me.periodTotal} free applications used.`}
          </p>
        </div>
        {onUpgrade ? (
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-bold text-white"
            style={{ background: "var(--gg-green-dark)" }}
          >
            {empty ? "Pick a plan →" : "Upgrade"}
          </button>
        ) : (
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-bold text-white"
            style={{ background: "var(--gg-green-dark)" }}
          >
            {empty ? "Pick a plan →" : "Upgrade"}
          </Link>
        )}
      </div>
    </Container>
  );
}

function Container({
  variant,
  tone = "neutral",
  children,
}: {
  variant: "compact" | "card";
  tone?: "neutral" | "info" | "warn";
  children: React.ReactNode;
}) {
  const bg =
    tone === "warn" ? "#FEF3C7" : tone === "info" ? "var(--gg-green-tint-2)" : "white";
  const border =
    tone === "warn" ? "#F59E0B" : tone === "info" ? "var(--gg-green-tint)" : "var(--gg-line)";
  if (variant === "compact") {
    return (
      <div
        className="rounded-xl border p-3 sm:p-4"
        style={{ background: bg, borderColor: border }}
      >
        {children}
      </div>
    );
  }
  return (
    <section
      className="rounded-2xl border bg-white p-6"
      style={{ background: bg, borderColor: border }}
    >
      <h2
        className="m-0 mb-3 text-sm font-bold uppercase tracking-wider"
        style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
      >
        Billing
      </h2>
      {children}
    </section>
  );
}
