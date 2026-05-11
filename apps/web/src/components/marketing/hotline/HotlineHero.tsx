"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  IconPhone,
  IconGlobe,
  IconCheck,
  IconBolt,
} from "./icons";
import { LivePreviewCall } from "./LivePreviewCall";
import { CallbackModal } from "./CallbackModal";

type Mode = "worker" | "employer";
type Props = { mode: Mode };

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

export function HotlineHero({ mode }: Props) {
  const isWorker = mode === "worker";
  const [modalOpen, setModalOpen] = useState(false);

  const headline = isWorker
    ? "Call this number.\nGet a job today."
    : "Call this number.\nWe staff your role.";
  const sub = isWorker
    ? "No CV. No forms. Talk to our AI for 2 minutes — in any language — and we'll match you to live jobs in your field."
    : "No long briefs. No coffees. Talk to our AI for 5 minutes — we'll write the JD, search vetted talent, and send you ranked candidates within the hour.";

  return (
    <>
      <section
        style={{
          background:
            "linear-gradient(180deg, var(--gg-green-tint-2) 0%, var(--gg-bg) 80%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.5,
            background:
              "repeating-linear-gradient(135deg, transparent 0, transparent 60px, rgba(14,159,74,0.04) 60px, rgba(14,159,74,0.04) 61px)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-6 pt-9 pb-20 sm:px-8">
          <div className="mb-10 flex justify-center">
            <ModeToggle mode={mode} />
          </div>

          <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <div>
              <div
                className="mono mb-5 inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{
                  borderColor: "var(--gg-line)",
                  color: "var(--gg-green-dark)",
                  letterSpacing: "0.06em",
                }}
              >
                <IconBolt width={13} height={13} />
                <span>
                  {isWorker
                    ? "Voice-first hiring hotline"
                    : "Recruiter hotline · vetted pool"}
                </span>
              </div>

              <div
                className="mb-8 rounded-3xl border bg-white p-8 sm:p-9"
                style={{
                  borderColor: "var(--gg-line)",
                  boxShadow:
                    "0 30px 80px -50px rgba(14,40,22,0.25), 0 2px 6px rgba(14,40,22,0.04)",
                }}
              >
                <PhoneDialer
                  number={HOTLINE}
                  label={
                    isWorker ? "24/7 Worker Hotline" : "24/7 Recruiter Hotline"
                  }
                  onCall={() => setModalOpen(true)}
                />
                <div
                  className="mt-5 flex flex-wrap items-center gap-4 border-t pt-4 text-sm"
                  style={{
                    borderTopStyle: "dashed",
                    borderTopColor: "var(--gg-line-2)",
                    color: "var(--gg-muted)",
                  }}
                >
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{ color: "var(--gg-muted)" }}
                  >
                    <IconGlobe
                      width={14}
                      height={14}
                      style={{ color: "var(--gg-green-dark)" }}
                    />{" "}
                    32 languages
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <IconCheck
                      width={14}
                      height={14}
                      style={{ color: "var(--gg-green-dark)" }}
                    />{" "}
                    Free to call
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <IconBolt
                      width={14}
                      height={14}
                      style={{ color: "var(--gg-green-dark)" }}
                    />{" "}
                    Avg. {isWorker ? "2-min" : "5-min"} intake
                  </span>
                </div>
              </div>

              <h1
                className="m-0 mb-4 whitespace-pre-line font-extrabold leading-[1.02] tracking-[-0.035em]"
                style={{ fontSize: "clamp(40px, 5vw, 64px)" }}
              >
                {headline.split("\n").map((line, i) => (
                  <span
                    key={i}
                    className="block"
                    style={{
                      color: i === 0 ? "var(--gg-ink)" : "var(--gg-green)",
                    }}
                  >
                    {line}
                  </span>
                ))}
              </h1>
              <p
                className="m-0 max-w-xl text-lg leading-relaxed"
                style={{ color: "var(--gg-ink-2)" }}
              >
                {sub}
              </p>
            </div>

            <div>
              <LivePreviewCall mode={mode} />
            </div>
          </div>
        </div>
      </section>

      <CallbackModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={mode}
      />
    </>
  );
}

function ModeToggle({ mode }: { mode: Mode }) {
  return (
    <div
      className="inline-flex rounded-full border bg-white p-1.5"
      style={{
        borderColor: "var(--gg-line)",
        boxShadow: "0 1px 2px rgba(15,40,25,0.04)",
      }}
    >
      <ModeToggleLink mode="worker" active={mode === "worker"} />
      <ModeToggleLink mode="employer" active={mode === "employer"} />
    </div>
  );
}

function ModeToggleLink({ mode, active }: { mode: Mode; active: boolean }) {
  const href = mode === "worker" ? "/" : "/hiring";
  const label =
    mode === "worker" ? "I'm looking for work" : "I'm hiring";
  const emoji = mode === "worker" ? "👷" : "💼";
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all"
      style={{
        background: active ? "var(--gg-green)" : "transparent",
        color: active ? "white" : "var(--gg-ink-2)",
      }}
    >
      <span style={{ fontSize: 16 }}>{emoji}</span>
      {label}
    </Link>
  );
}

function PhoneDialer({
  number,
  label,
  onCall,
}: {
  number: string;
  label: string;
  onCall: () => void;
}) {
  const digits = number.split("");
  return (
    <div className="relative">
      <div
        className="mono mb-3 flex items-center gap-2.5 text-xs font-medium uppercase tracking-widest"
        style={{
          color: "var(--gg-muted)",
          letterSpacing: "0.14em",
        }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background: "#1FCE6A",
            animation: "glowDot 1.6s ease-in-out infinite",
            boxShadow: "0 0 0 3px rgba(31,206,106,0.18)",
          }}
        />
        {label}
      </div>
      <div className="flex flex-wrap items-baseline gap-1.5 leading-none">
        {digits.map((d, i) => {
          const isSep = d === " " || d === "-";
          return (
            <span
              key={i}
              className="mono font-bold"
              style={{
                fontSize: isSep ? 48 : 64,
                color: isSep ? "var(--gg-line-2)" : "var(--gg-ink)",
                letterSpacing: "-0.04em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {d === " " ? "·" : d}
            </span>
          );
        })}
      </div>
      <div className="mt-7 flex flex-wrap gap-3">
        <a
          href={`tel:${number.replace(/\s/g, "")}`}
          className="inline-flex items-center gap-2.5 rounded-xl px-6 py-4 text-base font-bold text-white"
          style={{
            background: "var(--gg-green)",
            boxShadow: "0 8px 24px -8px rgba(14,159,74,0.5)",
          }}
        >
          <IconPhone width={18} height={18} /> Tap to call
        </a>
        <button
          type="button"
          onClick={onCall}
          className="rounded-xl border-[1.5px] bg-white px-5 py-4 text-sm font-semibold"
          style={{
            borderColor: "var(--gg-line-2)",
            color: "var(--gg-ink)",
          }}
        >
          Call me instead
        </button>
      </div>
    </div>
  );
}
