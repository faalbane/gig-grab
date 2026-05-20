"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { findLanguage } from "@/lib/languages";

type SessionStatus =
  | "ringing"
  | "in_progress"
  | "completed"
  | "abandoned"
  | "failed";

type Turn = {
  ord: number;
  speaker: "ai" | "candidate";
  text: string;
  msOffset: number;
};

const TERMINAL: SessionStatus[] = ["completed", "abandoned", "failed"];

function CallingCardInner() {
  const params = useSearchParams();
  const e164 = params.get("e164") ?? "+44 0000 000000";
  const langCode = params.get("lang") ?? "en";
  const audience = params.get("audience") ?? "worker";
  const sessionId = params.get("sessionId") ?? "";
  const token = params.get("token") ?? "";
  const language = findLanguage(langCode);

  const isEmployer = audience === "employer";
  // Employer intake routes to the hiring dashboard, not the candidate
  // profile. The token-gated /profile page would render their CV which
  // is the wrong artifact for someone who called to post a job.
  const profileHref = isEmployer
    ? "/dashboard/hiring"
    : sessionId && token
      ? `/profile?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`
      : "/profile";
  const ctaLabel = isEmployer ? "See my job →" : "Skip to my profile →";

  const [status, setStatus] = useState<SessionStatus>("ringing");
  const [turns, setTurns] = useState<Turn[]>([]);
  const sinceRef = useRef(0);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  // Poll status + new transcript turns once a second while the call is live.
  useEffect(() => {
    if (!sessionId || !token) return;
    let cancelled = false;

    async function tick() {
      try {
        const [statusRes, turnsRes] = await Promise.all([
          fetch(`/api/sessions/${sessionId}/status?token=${encodeURIComponent(token)}`),
          fetch(
            `/api/sessions/${sessionId}/turns?since=${sinceRef.current}&token=${encodeURIComponent(token)}`,
          ),
        ]);
        if (cancelled) return;
        if (statusRes.ok) {
          const j = await statusRes.json();
          if (j.status) setStatus(j.status as SessionStatus);
          // Only auto-redirect on SUCCESSFUL completion. Voicemail /
          // no-answer / failed used to also redirect, which masked the
          // failure state with a stale "calling…" UI on browser back.
          // Now we stay on the page + render the abandoned/failed
          // message + a Try again CTA.
          if (j.status === "completed") {
            window.location.href = profileHref;
            return;
          }
          if (j.status === "abandoned" || j.status === "failed") {
            // Stop polling — call is over.
            cancelled = true;
            return;
          }
        }
        if (turnsRes.ok) {
          const j = await turnsRes.json();
          const newTurns: Turn[] = j.turns ?? [];
          if (newTurns.length > 0) {
            setTurns((prev) => [...prev, ...newTurns]);
            sinceRef.current = newTurns[newTurns.length - 1].ord + 1;
          }
        }
      } catch {
        // ignore transient network errors
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, token, profileHref]);

  // Auto-scroll transcript to bottom on new turn.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Re-fetch status when the page is restored from BFCache (back/forward
  // navigation). Otherwise a user who hit Back lands on a cached
  // "Calling…" render even though the Twilio call already ended.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted && sessionId && token) {
        fetch(
          `/api/sessions/${sessionId}/status?token=${encodeURIComponent(token)}`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j?.status) setStatus(j.status as SessionStatus);
          })
          .catch(() => {});
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [sessionId, token]);

  // Phase pulse animation
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % 100), 1200);
    return () => clearInterval(id);
  }, []);

  const phase = phaseLabel(status, audience);

  return (
    <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <div className="relative mx-auto h-20 w-20">
          <div
            className={`absolute inset-0 rounded-full bg-emerald-200 transition-transform duration-1000 ease-out ${
              status === "in_progress" ? "scale-110 opacity-50" : pulse % 2 ? "scale-110 opacity-50" : "scale-100 opacity-80"
            }`}
          />
          <div className="absolute inset-2 grid place-items-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg">
            {status === "in_progress" ? "🎙️" : "📞"}
          </div>
        </div>
        <p className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
          {phase.title} {e164}
        </p>
        <p className="mt-2 text-sm text-gray-600">{phase.sub}</p>
        {language && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
            <span>{language.flag}</span>
            <span>Speaking {language.name}</span>
          </div>
        )}
      </div>

      {/* Live transcript */}
      <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50">
        <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Live transcript
          </h3>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            {turns.length} {turns.length === 1 ? "turn" : "turns"}
          </span>
        </header>
        <div
          ref={transcriptScrollRef}
          className="max-h-72 space-y-2 overflow-y-auto px-4 py-3"
        >
          {turns.length === 0 && (
            <p className="text-sm text-gray-400">
              Pick up the phone — the conversation will appear here as you speak.
            </p>
          )}
          {dedupeTurns(turns).map((t, i) => (
            <Bubble key={`${t.ord}-${i}`} turn={t} />
          ))}
        </div>
      </div>

      {status === "abandoned" || status === "failed" ? (
        <div className="mt-6 flex flex-col gap-2">
          <a
            href="/start"
            className="block w-full rounded-md bg-emerald-600 px-5 py-3 text-center text-sm font-medium text-white hover:bg-emerald-700"
          >
            Try again →
          </a>
          <a
            href="/"
            className="block w-full rounded-md border border-gray-300 bg-white px-5 py-3 text-center text-sm font-medium text-gray-700 hover:border-gray-400"
          >
            Back to home
          </a>
        </div>
      ) : (
        <a
          href={profileHref}
          className="mt-6 block w-full rounded-md bg-gray-900 px-5 py-3 text-center text-sm font-medium text-white hover:bg-gray-800"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const isAi = turn.speaker === "ai";
  return (
    <div className={`flex ${isAi ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed ${
          isAi ? "bg-white text-gray-900 border border-gray-200" : "bg-emerald-600 text-white"
        }`}
      >
        {turn.text}
      </div>
    </div>
  );
}

// Coalesce consecutive same-speaker fragments so the live feed reads like a
// single utterance instead of "Frank" / "and I'd like" / "to chat in English".
function dedupeTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.speaker === t.speaker) {
      out[out.length - 1] = { ...last, text: `${last.text} ${t.text}`.trim() };
    } else {
      out.push(t);
    }
  }
  return out;
}

function phaseLabel(
  status: SessionStatus,
  audience: string,
): { title: string; sub: string } {
  switch (status) {
    case "ringing":
      return {
        title: "Calling",
        sub:
          audience === "worker"
            ? "Pick up — your AI recruiter is on the line."
            : "Pick up — we'll learn about the role you're hiring for.",
      };
    case "in_progress":
      return {
        title: "On the call with",
        sub: "Talking now — keep going. Hang up when you're done.",
      };
    case "completed":
      return { title: "Call complete with", sub: "Building your profile…" };
    case "abandoned":
      return {
        title: "Couldn't reach",
        sub: "We didn't get an answer. Try again from /start.",
      };
    case "failed":
      return {
        title: "Call failed for",
        sub: "Something went wrong placing the call. Try again from /start.",
      };
  }
}

export function CallingCard() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">Connecting…</p>
        </div>
      }
    >
      <CallingCardInner />
    </Suspense>
  );
}
