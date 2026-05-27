"use client";

/**
 * EmployerWelcomeModal — first-time pop on the employer hiring
 * dashboard. Mirrors the candidate PaywallModal pattern but for the
 * employer commercial model (3 free candidate reviews, then placement
 * fee starting $1,000 negotiated offline via callback). Stripe SaaS
 * for employers is post-pilot; this modal frames the current
 * placement-based contract.
 *
 * Two CTAs:
 *   "Got it, continue" → dismiss + set localStorage flag
 *   "Talk to us first" → onTalkToUs callback (opens CallbackModal)
 *
 * Dismiss persistence: localStorage `gg.employerWelcomeSeen` = "1".
 */

import { useEffect } from "react";
import { track } from "@/components/PostHogProvider";

export const EMPLOYER_WELCOME_SEEN_KEY = "gg.employerWelcomeSeen";

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
        className="relative w-full max-w-xl rounded-2xl border bg-white p-6 shadow-2xl sm:p-8"
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

        <header className="mb-5">
          <p
            className="mono text-[10px] font-semibold uppercase"
            style={{
              color: "var(--gg-green-dark)",
              letterSpacing: "0.14em",
            }}
          >
            Welcome to GigGrab
          </p>
          <h2
            id="employer-welcome-title"
            className="m-0 mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]"
            style={{ color: "var(--gg-ink)" }}
          >
            Here&rsquo;s how hiring with us works.
          </h2>
        </header>

        <ul className="space-y-3">
          <BenefitRow
            n="1"
            title={`${freeReviewsLimit} free candidate reviews`}
            body="Shortlist, request an interview, or reject — each action counts as one review. Try the platform with no commitment."
          />
          <BenefitRow
            n="2"
            title="Voice-vetted candidates"
            body="Every worker completes a 2-minute AI intake call before they appear in your shortlist. You only meet people who can actually do the job."
          />
          <BenefitRow
            n="3"
            title="Placement fee from $1,000 per hire"
            body="When you're ready to scale beyond the free trial, we charge a flat placement fee on successful hires. No subscriptions, no per-seat costs, no recurring billing."
          />
        </ul>

        <div
          className="mt-5 rounded-xl border p-3.5"
          style={{ background: "var(--gg-bg)", borderColor: "var(--gg-line)" }}
        >
          <p
            className="m-0 text-sm leading-relaxed"
            style={{ color: "var(--gg-ink-2)" }}
          >
            Have questions about pricing, contracts, or fit before you
            start? Book a quick call and our team will walk you through
            the placement process.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: "var(--gg-green-dark)" }}
          >
            Got it, continue
          </button>
          <button
            type="button"
            onClick={talkToUs}
            className="inline-flex items-center justify-center rounded-md border px-4 py-2.5 text-sm font-semibold"
            style={{
              borderColor: "var(--gg-line-2)",
              color: "var(--gg-ink)",
              background: "white",
            }}
          >
            Talk to us first
          </button>
        </div>
      </div>
    </div>
  );
}

function BenefitRow({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mono mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: "var(--gg-green-tint)",
          color: "var(--gg-green-dark)",
        }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="m-0 text-sm font-bold"
          style={{ color: "var(--gg-ink)" }}
        >
          {title}
        </p>
        <p
          className="m-0 mt-0.5 text-sm leading-relaxed"
          style={{ color: "var(--gg-ink-2)" }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}
