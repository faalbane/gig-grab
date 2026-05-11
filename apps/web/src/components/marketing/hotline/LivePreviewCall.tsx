"use client";

import { useEffect, useState } from "react";
import { IconPhone } from "./icons";

type Mode = "worker" | "employer";

const WORKER_MATCHES = [
  { role: "Site Carpenter", org: "Bayford Build", loc: "Manchester", pay: "£220/day", match: 98 },
  { role: "Registered Nurse", org: "Mercy NHS Trust", loc: "Leeds", pay: "£36k", match: 96 },
  { role: "Sous Chef", org: "Otto & Pearl", loc: "Bristol · fine dining", pay: "£32k", match: 94 },
];

const RECRUITER_MATCHES = [
  { role: "Marcus T. — Site Carpenter", org: "12 yrs · Gold CSCS", loc: "Manchester", pay: "£220/day", match: 98 },
  { role: "Priya R. — Product Designer", org: "9 yrs · ex-Spotify", loc: "Remote", pay: "£72k", match: 96 },
  { role: "Daniel K. — Sous Chef", org: "8 yrs · fine dining", loc: "Bristol", pay: "£32k", match: 94 },
];

const WORKER_SCRIPT = [
  { from: "ai" as const, t: "GigGrab here. What kind of work are you after?" },
  { from: "user" as const, t: "I'm a carpenter — 12 years on site. Looking around Manchester." },
  { from: "ai" as const, t: "Got it. Day rate, weekday only, or open to weekends?" },
  { from: "user" as const, t: "Day rate. Weekdays. £200 minimum." },
  { from: "ai" as const, t: "Pulling matches… I have 3 live roles above £200, all within 14 miles." },
];

const RECRUITER_SCRIPT = [
  { from: "ai" as const, t: "GigGrab. What role are you filling today?" },
  { from: "user" as const, t: "Senior Product Designer. Fully remote. Up to £80k." },
  { from: "ai" as const, t: "Stack preference? B2B, consumer, or agency background?" },
  { from: "user" as const, t: "B2B SaaS, ideally with growth-stage experience." },
  { from: "ai" as const, t: "Drafting brief. Ranking 412 vetted candidates against it now." },
];

export function LivePreviewCall({ mode }: { mode: Mode }) {
  const matches = mode === "worker" ? WORKER_MATCHES : RECRUITER_MATCHES;
  const script = mode === "worker" ? WORKER_SCRIPT : RECRUITER_SCRIPT;
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const t = setInterval(
      () => setStep((s) => (s + 1) % (script.length + 3)),
      1900,
    );
    return () => clearInterval(t);
  }, [script.length]);

  const shownMessages = script.slice(0, Math.min(step, script.length));
  const typing = step < script.length;
  const revealed = Math.max(0, Math.min(step - script.length, matches.length));

  return (
    <div
      className="overflow-hidden rounded-[22px] border bg-white"
      style={{
        borderColor: "var(--gg-line)",
        boxShadow:
          "0 20px 60px -30px rgba(14,40,22,0.18), 0 2px 6px rgba(14,40,22,0.04)",
      }}
    >
      {/* Call header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3.5"
        style={{
          borderBottomColor: "var(--gg-line)",
          background: "var(--gg-green-tint-2)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="relative grid h-8 w-8 place-items-center rounded-full text-white"
            style={{ background: "var(--gg-green)" }}
          >
            <IconPhone width={14} height={14} />
            <span
              className="absolute inset-0 rounded-full border-2"
              style={{
                borderColor: "var(--gg-green)",
                animation: "pulseRing 1.8s ease-out infinite",
              }}
            />
          </div>
          <div>
            <div className="text-sm font-bold">Live call · GigGrab AI</div>
            <div
              className="mono text-[11px]"
              style={{ color: "var(--gg-muted)" }}
            >
              00:47 · 🎙 listening
            </div>
          </div>
        </div>
        <div className="flex h-7 items-end gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-[3px] rounded-[2px]"
              style={{
                background: "var(--gg-green)",
                animation: "wave 1s ease-in-out infinite",
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Transcript — fixed height so cycling animations don't push the
          rest of the panel up/down on every tick. */}
      <div
        className="flex flex-col gap-2.5 px-4.5 pb-1 pt-4.5"
        style={{ height: 240, overflow: "hidden" }}
      >
        {shownMessages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.from === "ai" ? "justify-start" : "justify-end"}`}
            style={{ animation: "slideUp 320ms ease" }}
          >
            <div
              className="max-w-[82%] rounded-[14px] px-3 py-2 text-[13.5px] font-medium leading-snug"
              style={{
                background:
                  m.from === "ai" ? "var(--gg-green-tint)" : "var(--gg-ink)",
                color: m.from === "ai" ? "var(--gg-green-deep)" : "white",
                borderBottomLeftRadius: m.from === "ai" ? 4 : 14,
                borderBottomRightRadius: m.from === "user" ? 4 : 14,
              }}
            >
              {m.t}
            </div>
          </div>
        ))}
        {typing && (
          <div
            className="flex gap-1 self-start rounded-[14px] px-3 py-1.5"
            style={{
              background: "var(--gg-green-tint)",
              borderBottomLeftRadius: 4,
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--gg-green)",
                  animation: "typingDots 1.1s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Match feed */}
      <div
        className="mt-2 border-t px-4.5 pb-4.5 pt-3.5"
        style={{ borderTopColor: "var(--gg-line)" }}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-sm font-bold">
            {mode === "worker" ? "Live matches" : "Top vetted candidates"}
          </div>
          <div
            className="mono rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              color: "var(--gg-green-dark)",
              background: "var(--gg-green-tint)",
            }}
          >
            {revealed} new
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {matches.slice(0, 3).map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border px-3 py-2.5"
              style={{
                borderColor: "var(--gg-line)",
                opacity: i < revealed ? 1 : 0.2,
                transform: i < revealed ? "translateY(0)" : "translateY(4px)",
                transition: "all 400ms ease",
                background: i < revealed ? "white" : "var(--gg-bg)",
              }}
            >
              <div>
                <div className="text-[13.5px] font-bold">{m.role}</div>
                <div
                  className="mt-px text-xs"
                  style={{ color: "var(--gg-muted)" }}
                >
                  {m.org} · {m.loc} · {m.pay}
                </div>
              </div>
              <div
                className="rounded-lg px-2 py-1 text-[11.5px] font-bold"
                style={{
                  color: "var(--gg-green-dark)",
                  background: "var(--gg-green-tint)",
                }}
              >
                {m.match}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
