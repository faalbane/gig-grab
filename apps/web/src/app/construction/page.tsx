"use client";

/**
 * /construction — A/B test landing page. Stripped-down conversion-
 * focused variant of the homepage. One CTA, one phone number, no
 * mode toggle, no pricing nav, no employer nav.
 *
 * Goal: reduce decision fatigue → boost call-conversion vs the
 * primary homepage (which currently underperforms on signup despite
 * solid unique-visitor traffic).
 *
 * Aliased at /jobs (same component, second route export below).
 *
 * Tel: links: BOTH the visible phone number AND the big green button
 * are anchors with href="tel:+15515534910" so a tap on either fires
 * the dial intent on iOS Safari + Android Chrome.
 */

import React, { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { track } from "@/components/PostHogProvider";

const HOTLINE_DISPLAY = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";
const HOTLINE_TEL = (HOTLINE_DISPLAY.replace(/[^\d+]/g, "") || "+15515534910");

export default function ConstructionLanding() {
  useEffect(() => {
    track("landing_construction_viewed", {
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
  }, []);

  function onTel(source: "number" | "button" | "header") {
    track("landing_construction_call_tap", { source });
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Minimal header — Logo + the two market-mode links only. No
          Pricing / About / sign-in clutter that competes with the
          single CALL CTA below. */}
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo />
          <nav className="hidden gap-7 text-sm text-gray-700 sm:flex">
            <Link href="/" className="hover:text-gray-900">
              For Workers
            </Link>
            <Link href="/hiring" className="hover:text-gray-900">
              For Employers
            </Link>
          </nav>
        </div>
      </header>

      {/* Status strip — social proof + immediacy. */}
      <div
        className="px-6 py-2.5 text-center text-xs font-semibold sm:text-sm"
        style={{ background: "var(--gg-green-deep)", color: "white" }}
      >
        <span
          className="mr-2 inline-block h-2 w-2 rounded-full"
          style={{ background: "#34D399" }}
          aria-hidden
        />
        Workers matched this week: 800+ &nbsp;·&nbsp; Lines open now
      </div>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        {/* Left: copy + CTAs */}
        <div>
          <h1
            className="m-0 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-[68px]"
            style={{ color: "var(--gg-ink)" }}
          >
            Need work?
            <br />
            <span style={{ color: "var(--gg-green-dark)" }}>
              Call this number.
            </span>
          </h1>

          {/* The number itself is a tel: link — primary visual CTA. */}
          <a
            href={`tel:${HOTLINE_TEL}`}
            onClick={() => onTel("number")}
            className="mt-7 inline-block text-4xl font-extrabold underline decoration-2 underline-offset-4 sm:text-[44px]"
            style={{ color: "var(--gg-green-dark)" }}
          >
            {HOTLINE_DISPLAY}
          </a>

          <p
            className="m-0 mt-3 text-sm"
            style={{ color: "var(--gg-muted)" }}
          >
            Free to call &nbsp;·&nbsp; 32 languages &nbsp;·&nbsp; No signup
            required
          </p>

          {/* Single big primary button — also a tel: link. */}
          <a
            href={`tel:${HOTLINE_TEL}`}
            onClick={() => onTel("button")}
            className="mt-7 inline-flex w-full max-w-md items-center justify-center gap-3 rounded-xl px-6 py-5 text-lg font-bold text-white shadow-lg sm:text-xl"
            style={{ background: "var(--gg-green-dark)" }}
          >
            <PhoneIcon />
            CALL NOW — IT&rsquo;S FREE
          </a>

          <p
            className="m-0 mt-3 flex items-center gap-2 text-sm"
            style={{ color: "var(--gg-ink-2)" }}
          >
            <LockIcon />
            No app. No resume. Employer calls you back.
          </p>
        </div>

        {/* Right: phone mockup (pure CSS — no asset dependency). */}
        <div className="hidden lg:block">
          <PhoneMockup />
        </div>
      </section>

      {/* How it works — three minimal steps. */}
      <section className="mx-auto max-w-6xl px-6 pb-12 sm:pb-16">
        <h2
          className="m-0 text-center text-base font-extrabold tracking-tight sm:text-lg"
          style={{ color: "var(--gg-green-dark)" }}
        >
          How it works
        </h2>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3 sm:gap-4">
          <Step n="1" Icon={PhoneIcon} title="Call." body={`Call ${HOTLINE_DISPLAY} anytime.`} />
          <Step n="2" Icon={ChatIcon} title="Match." body="Tell Sarah your trade. Get matched with real jobs fast." />
          <Step n="3" Icon={BriefcaseIcon} title="Land." body="Connect with employers. Start work. Get paid." />
        </ol>
      </section>

      {/* Stats strip. */}
      <section
        className="border-y"
        style={{ background: "var(--gg-bg)", borderColor: "var(--gg-line)" }}
      >
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 sm:grid-cols-3 sm:gap-4 sm:py-10">
          <Stat
            Icon={BriefcaseIcon}
            big="10,000+"
            title="Trade Jobs Available"
            body="Updated daily in cities across the U.S."
          />
          <Stat
            Icon={ClockIcon}
            big="2 min"
            title="Avg. time to match"
            body="Get matched fast. Start working sooner."
          />
          <Stat
            Icon={PeopleIcon}
            big="Built for"
            title="Deskless Life"
            body="Tradespeople. Drivers. Installers. Mechanics. And more."
          />
        </div>
      </section>

      {/* Privacy footer. */}
      <section className="mx-auto max-w-6xl px-6 py-10 text-center">
        <p
          className="mx-auto inline-flex max-w-md items-center justify-center gap-2 text-sm"
          style={{ color: "var(--gg-ink-2)" }}
        >
          <ShieldIcon />
          <span>
            Your number stays private.{" "}
            <strong style={{ color: "var(--gg-ink)" }}>
              We never sell your data.
            </strong>{" "}
            No spam. Ever.
          </span>
        </p>
      </section>

      {/* Sticky mobile CTA — always-on-screen tel: bar so the user
          can dial from any scroll position. Hidden on >= sm. */}
      <a
        href={`tel:${HOTLINE_TEL}`}
        onClick={() => onTel("header")}
        className="fixed inset-x-3 bottom-3 z-40 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-bold text-white shadow-2xl sm:hidden"
        style={{ background: "var(--gg-green-dark)" }}
      >
        <PhoneIcon />
        Call {HOTLINE_DISPLAY}
      </a>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function Step({
  n,
  Icon,
  title,
  body,
}: {
  n: string;
  Icon: () => React.ReactElement;
  title: string;
  body: string;
}) {
  return (
    <li className="relative flex flex-col items-center text-center">
      <span
        className="mono mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: "var(--gg-green-dark)",
          color: "white",
        }}
      >
        {n}
      </span>
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "var(--gg-green-tint)" }}
      >
        <Icon />
      </span>
      <h3
        className="m-0 mt-3 text-base font-extrabold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {title}
      </h3>
      <p
        className="m-0 mt-1 max-w-[20ch] text-sm leading-snug"
        style={{ color: "var(--gg-ink-2)" }}
      >
        {body}
      </p>
    </li>
  );
}

function Stat({
  Icon,
  big,
  title,
  body,
}: {
  Icon: () => React.ReactElement;
  big: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--gg-green-tint)" }}
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p
          className="m-0 text-xl font-extrabold leading-tight tracking-tight"
          style={{ color: "var(--gg-ink)" }}
        >
          {big}
        </p>
        <p
          className="m-0 text-sm font-bold"
          style={{ color: "var(--gg-ink)" }}
        >
          {title}
        </p>
        <p
          className="m-0 mt-0.5 text-xs leading-snug"
          style={{ color: "var(--gg-muted)" }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        className="aspect-[9/19] rounded-[2.5rem] border-[10px] p-5 text-white shadow-2xl"
        style={{
          background:
            "linear-gradient(180deg, #0B1612 0%, #142420 50%, #0B1612 100%)",
          borderColor: "#1F2937",
        }}
      >
        <div className="flex h-full flex-col">
          <div
            className="mono mb-4 flex items-center justify-between text-[10px] opacity-80"
            style={{ letterSpacing: "0.08em" }}
          >
            <span>9:41</span>
            <span>● ● ●</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="m-0 text-2xl font-extrabold tracking-tight">Sarah</p>
            <p
              className="m-0 mt-0.5 text-xs"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              AI Job Assistant
            </p>
            <span
              className="mt-5 inline-flex h-24 w-24 items-center justify-center rounded-full text-3xl"
              style={{
                background: "rgba(52, 211, 153, 0.15)",
                border: "2px solid rgba(52, 211, 153, 0.8)",
              }}
              aria-hidden
            >
              👷‍♀️
            </span>
            <p
              className="mono m-0 mt-3 text-[10px] font-bold uppercase"
              style={{ color: "#34D399", letterSpacing: "0.18em" }}
            >
              ● LIVE
            </p>
            <div className="mt-5 flex h-12 items-end gap-1">
              {[3, 6, 10, 14, 10, 7, 12, 16, 9, 5, 11, 14, 8].map((h, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full"
                  style={{
                    height: `${h * 4}px`,
                    background: "#34D399",
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
            <p
              className="m-0 mt-5 max-w-[18ch] text-sm font-semibold leading-snug"
              style={{ color: "rgba(255,255,255,0.92)" }}
            >
              Finding framing jobs near Austin…
            </p>
            <p
              className="mono m-0 mt-1 text-[11px]"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              2:14
            </p>
          </div>
          <div className="mt-4 flex justify-center">
            <span
              className="inline-flex h-12 w-12 items-center justify-center rounded-full text-xl"
              style={{ background: "#DC2626" }}
              aria-hidden
            >
              ✕
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline SVG icons — no extra deps, render crisp at any size.
function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden style={{ color: "var(--gg-green-dark)" }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}
