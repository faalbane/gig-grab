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
      {/* Minimal header */}
      <header className="bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <Logo />
          <nav className="hidden gap-8 text-[15px] font-medium text-gray-800 sm:flex">
            <Link href="/" className="hover:text-black">
              For Workers
            </Link>
            <Link href="/hiring" className="hover:text-black">
              For Employers
            </Link>
          </nav>
        </div>
      </header>

      {/* Status strip */}
      <div
        className="px-6 py-2.5 text-center text-xs font-medium sm:text-[13px]"
        style={{ background: "#0D2C1B", color: "white" }}
      >
        <span
          className="mr-2 inline-block h-[10px] w-[10px] rounded-full"
          style={{ background: "#34D399" }}
          aria-hidden
        />
        Workers matched this week: 2300+ &nbsp;&nbsp;·&nbsp;&nbsp; Lines open now
      </div>

      <div className="relative bg-[#0B1612] text-white overflow-hidden min-h-[600px] flex items-center">
        {/* Full width background image */}
        <div className="absolute inset-0">
          <img
            src="/worker_wide.png"
            alt="Construction worker showing app"
            className="h-full w-full object-cover object-[75%_center]"
          />
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent"></div>
        </div>

        <section className="relative z-10 w-full mx-auto max-w-[1200px] px-6 py-16 sm:py-24">
          <div className="max-w-[600px] flex flex-col justify-center">
            <h1
              className="m-0 text-5xl font-extrabold leading-[1] tracking-tight sm:text-[72px]"
            >
              Need work?
              <br />
              <span style={{ color: "#34D399" }}>
                Call this number.
              </span>
            </h1>

            {/* The number itself */}
            <a
              href={`tel:${HOTLINE_TEL}`}
              onClick={() => onTel("number")}
              className="mt-8 inline-block text-[44px] font-bold underline decoration-4 underline-offset-8 sm:text-[54px] transition-opacity hover:opacity-80"
              style={{ color: "#34D399" }}
            >
              {HOTLINE_DISPLAY}
            </a>

            <p
              className="m-0 mt-5 text-[16px] font-medium opacity-90 text-gray-200"
            >
              Free to call &nbsp;&nbsp;·&nbsp;&nbsp; 32 languages &nbsp;&nbsp;·&nbsp;&nbsp; No signup required
            </p>

            {/* Button */}
            <a
              href={`tel:${HOTLINE_TEL}`}
              onClick={() => onTel("button")}
              className="mt-8 inline-flex w-full max-w-[420px] items-center justify-center gap-4 rounded-xl px-6 py-5 text-[22px] font-bold text-black shadow-lg transition hover:opacity-90"
              style={{ background: "#34D399" }}
            >
              <PhoneIcon width={28} height={28} fill="currentColor" stroke="none" />
              CALL NOW — IT&rsquo;S FREE
            </a>

            <p
              className="m-0 mt-6 flex items-center gap-2 text-[15px] font-medium opacity-90 text-gray-300"
            >
              <LockIcon />
              No app. No resume. Employer calls you back.
            </p>
          </div>
        </section>
      </div>

      <div className="h-px w-full bg-gray-100" />

      {/* How it works */}
      <section className="mx-auto max-w-[1000px] px-6 py-16 sm:py-24">
        <h2
          className="m-0 text-center text-[22px] font-bold tracking-tight"
          style={{ color: "var(--gg-green-dark)" }}
        >
          How it works
        </h2>
        
        <div className="relative mt-16">
          {/* Dashed arrows background - visible only on desktop */}
          <div className="hidden sm:flex absolute top-12 left-0 w-full justify-between px-[15%] items-center -z-10 text-gray-300">
             <span className="text-xl tracking-[4px] font-bold">-----&gt;</span>
             <span className="text-xl tracking-[4px] font-bold">-----&gt;</span>
          </div>

          <ol className="relative grid gap-16 sm:grid-cols-3 sm:gap-6">
            <Step n="1" Icon={PhoneIconOutline} title="Call." body={`Call ${HOTLINE_DISPLAY} anytime.`} />
            <Step n="2" Icon={ChatIcon} title="Match." body="Tell Sarah your trade. Get matched with real jobs fast." />
            <Step n="3" Icon={BriefcaseIcon} title="Land." body="Connect with employers. Start work. Get paid. Move forward." />
          </ol>
        </div>
      </section>

      {/* Stats strip */}
      <section className="mx-auto max-w-[1200px] px-6 pb-12">
        <div className="rounded-[24px] bg-[#F9F9F9] px-8 py-10 sm:px-12 sm:py-12 border border-gray-100">
          <div className="grid gap-12 sm:grid-cols-3 sm:divide-x sm:divide-gray-200 sm:gap-0">
            <Stat
              Icon={BriefcaseIconSmall}
              big="10,000+"
              title="Trade Jobs Available"
              body="Updated daily in cities across the U.S."
              className="sm:pr-10"
            />
            <Stat
              Icon={ClockIconSmall}
              big="2 min"
              title="Avg. time to match"
              body="Get matched fast. Start working sooner."
              className="sm:px-10"
            />
            <Stat
              Icon={PeopleIconSmall}
              big="Built for"
              title="Deskless Life"
              body="Tradespeople. Drivers. Installers. Mechanics. And more."
              className="sm:pl-10"
            />
          </div>
        </div>
      </section>

      {/* Privacy footer. */}
      <section className="mx-auto max-w-6xl px-6 py-6 pb-20 text-center sm:pb-16">
        <p
          className="mx-auto flex max-w-md items-center justify-center gap-3 text-[15px] font-medium"
          style={{ color: "#444" }}
        >
          <ShieldIcon />
          <span>
            Your number stays private.{" "}
            <strong className="text-black font-bold">
              We never sell your data.
            </strong>{" "}
            No spam. Ever.
          </span>
        </p>
      </section>

      {/* Sticky mobile CTA */}
      <a
        href={`tel:${HOTLINE_TEL}`}
        onClick={() => onTel("header")}
        className="fixed inset-x-3 bottom-3 z-40 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-bold text-white shadow-2xl sm:hidden"
        style={{ background: "var(--gg-green-dark)" }}
      >
        <PhoneIcon width={20} height={20} fill="currentColor" stroke="none" />
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
    <li className="relative flex flex-col items-center text-center bg-white">
      <span
        className="mono mb-[-12px] relative z-10 inline-flex h-[28px] w-[28px] items-center justify-center rounded-full text-[15px] font-bold"
        style={{
          background: "var(--gg-green-dark)",
          color: "white",
        }}
      >
        {n}
      </span>
      <span
        className="inline-flex h-[110px] w-[110px] items-center justify-center rounded-full"
        style={{ background: "#F2F7F4", color: "var(--gg-green-dark)" }}
      >
        <Icon />
      </span>
      <h3
        className="m-0 mt-6 text-[22px] font-bold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {title}
      </h3>
      <p
        className="m-0 mt-3 max-w-[22ch] text-[15px] leading-[1.6]"
        style={{ color: "#444" }}
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
  className = "",
}: {
  Icon: () => React.ReactElement;
  big: string;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-5 ${className}`}>
      <span
        className="mt-1 inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "#EBF3EE", color: "var(--gg-green-dark)" }}
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p
          className="m-0 text-[26px] font-bold leading-none tracking-tight sm:text-[28px]"
          style={{ color: "var(--gg-ink)" }}
        >
          {big}
        </p>
        <p
          className="m-0 mt-2 text-[15px] font-bold"
          style={{ color: "var(--gg-ink)" }}
        >
          {title}
        </p>
        <p
          className="m-0 mt-1.5 text-[14px] leading-snug"
          style={{ color: "#555" }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}



// Inline SVG icons
function PhoneIcon({ width = 18, height = 18, fill = "none", stroke = "currentColor" }: { width?: number; height?: number; fill?: string; stroke?: string; }) {
  if (fill !== "none") {
    // Solid icon style for buttons
    return (
      <svg width={width} height={height} viewBox="0 0 24 24" fill={fill}>
        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.03 21c.53 0 .96-.28.96-.8V16.37c0-.54-.44-.99-.98-.99z"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={width} height={height} aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PhoneIconOutline() {
  return (
    <svg viewBox="0 0 24 24" fill="var(--gg-green-dark)" width="48" height="48" aria-hidden>
      <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.03 21c.53 0 .96-.28.96-.8V16.37c0-.54-.44-.99-.98-.99z"/>
    </svg>
  );
}

function PhoneDownIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="white">
      <path d="M21 16.29c-.77-.45-1.61-.83-2.49-1.12a.98.98 0 00-1.05.28l-1.58 1.9c-2.81-1.44-5.35-3.95-6.79-6.73L11.02 9a.97.97 0 00.28-1.05c-.29-.88-.67-1.72-1.12-2.49A1 1 0 009.31 5H5.06c-.57 0-1.06.49-1.06 1.06C4 13.76 10.24 20 17.94 20c.57 0 1.06-.49 1.06-1.06v-4.25a1 1 0 00-.47-.84z" transform="rotate(135 12 12)" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="var(--gg-green-dark)" width="48" height="48" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="var(--gg-green-dark)" width="44" height="44" aria-hidden>
      <path d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 6a2 2 0 0 1 4 0v1h-4V6z"/>
    </svg>
  );
}

function ClockIconSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="var(--gg-green-dark)" width="28" height="28" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BriefcaseIconSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="var(--gg-green-dark)" width="28" height="28" aria-hidden>
      <path d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 6a2 2 0 0 1 4 0v1h-4V6z"/>
    </svg>
  );
}

function PeopleIconSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="var(--gg-green-dark)" width="28" height="28" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden>
      <path d="M17 11V7a5 5 0 0 0-10 0v4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-5 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 11V7c0-1.66 1.34-3 3-3s3 1.34 3 3v4H9z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28" aria-hidden style={{ color: "var(--gg-green-dark)" }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}
