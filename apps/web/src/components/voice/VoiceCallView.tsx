"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAuthUser,
  fetchWithAuth,
} from "@/lib/firebase";
import {
  startVoiceCall,
  type VoiceCallController,
} from "@/lib/web-voice";
import { CvPreview } from "@/components/profile/CvPreview";
import {
  IconPhone,
  IconMic,
  IconClose,
} from "@/components/marketing/hotline/icons";
import type { ProfileCard } from "@/lib/types";

type StartResponse = {
  sessionId: string;
  candidateId: string;
  wsUrl: string;
  token: string;
};

type Turn = {
  ord: number;
  speaker: "ai" | "candidate";
  text: string;
  msOffset: number;
};

type Phase = "idle" | "starting" | "live" | "ended" | "error";

type AccountMe = {
  candidate: {
    id: string;
    phone: string | null;
    email: string | null;
    language: string;
  };
  profile: ProfileCard | null;
};

export function VoiceCallView() {
  const user = useAuthUser();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StartResponse | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const sinceRef = useRef(0);
  const controllerRef = useRef<VoiceCallController | null>(null);
  const [me, setMe] = useState<AccountMe | null>(null);
  const startedAtRef = useRef<number>(0);

  // Initial /account/me fetch so the CV pane has something to show.
  useEffect(() => {
    if (user === null || user === false) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithAuth<AccountMe>("/api/account/me");
        if (!cancelled) setMe(data);
      } catch {
        // Not fatal — CV will just show empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Live transcript poll (same pattern as the phone /calling).
  useEffect(() => {
    if (!session || phase !== "live") return;
    let cancelled = false;
    async function tick() {
      if (!session) return;
      try {
        const res = await fetch(
          `/api/sessions/${session.sessionId}/turns?since=${sinceRef.current}&token=${encodeURIComponent(session.token)}`,
        );
        if (!res.ok) return;
        const j = (await res.json()) as { turns: Turn[] };
        const next = j.turns ?? [];
        if (!cancelled && next.length > 0) {
          setTurns((prev) => [...prev, ...next]);
          sinceRef.current = next[next.length - 1].ord + 1;
        }
      } catch {
        // benign; next tick will retry
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, phase]);

  // After the call ends, poll /account/me a few times to pick up the
  // freshly-extracted profile_card. extractProfile runs server-side
  // from the session status callback; we wait up to ~30s.
  useEffect(() => {
    if (phase !== "ended" || !startedAtRef.current) return;
    let cancelled = false;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const data = await fetchWithAuth<AccountMe>("/api/account/me");
        if (cancelled) return;
        setMe(data);
        const updatedAtMs = data.profile?.updatedAt
          ? new Date(data.profile.updatedAt).getTime()
          : 0;
        if (updatedAtMs > startedAtRef.current) {
          clearInterval(id);
        }
      } catch {
        // benign
      }
      if (attempts >= 15) clearInterval(id);
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase]);

  async function start() {
    if (user === null || user === false) return;
    setError(null);
    setTurns([]);
    sinceRef.current = 0;
    setPhase("starting");
    try {
      const j = await fetchWithAuth<StartResponse>(
        "/api/account/web-call/start",
        { method: "POST", body: JSON.stringify({ language: "en" }) },
      );
      setSession(j);
      startedAtRef.current = Date.now();
      const ctrl = await startVoiceCall(j.wsUrl, {
        onStateChange: (s) => {
          if (s === "live") setPhase("live");
          else if (s === "ended") {
            setPhase((prev) => (prev === "live" ? "ended" : prev));
          } else if (s === "error") {
            setError(
              "Couldn't reach the voice agent. The build may still be rolling out — try again in a minute, or call the hotline instead.",
            );
            setPhase("error");
          }
        },
        onError: (e) => setError(e.message),
      });
      controllerRef.current = ctrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start. Please try again.",
      );
      setPhase("error");
    }
  }

  async function stop() {
    await controllerRef.current?.end();
    setPhase("ended");
  }

  if (user === null) {
    return (
      <p className="text-sm" style={{ color: "var(--gg-muted)" }}>
        Loading…
      </p>
    );
  }
  if (user === false) {
    return (
      <div
        className="rounded-2xl border bg-white p-8"
        style={{ borderColor: "var(--gg-line)" }}
      >
        <h2
          className="m-0 text-xl font-extrabold tracking-tight"
          style={{ color: "var(--gg-ink)" }}
        >
          Sign in to use the browser microphone
        </h2>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--gg-muted)" }}
        >
          We need to know who you are to attach this call to your profile.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/auth"
            className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-bold text-white"
            style={{ background: "var(--gg-ink)" }}
          >
            Sign in
          </Link>
          <Link
            href="/start"
            className="inline-flex h-11 items-center rounded-xl border-[1.5px] bg-white px-5 text-sm font-semibold"
            style={{
              borderColor: "var(--gg-line-2)",
              color: "var(--gg-ink)",
            }}
          >
            Or call me on my phone
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,440px)]">
      {/* LEFT — call control + transcript */}
      <div className="space-y-4">
        <CallControlCard
          phase={phase}
          onStart={start}
          onStop={stop}
          error={error}
        />
        <TranscriptCard
          phase={phase}
          turns={turns}
        />
      </div>

      {/* RIGHT — CV preview */}
      <div>
        <CvPreview
          card={me?.profile ?? null}
          email={me?.candidate.email ?? undefined}
        />
        {phase === "ended" && (
          <p
            className="mt-3 text-center text-xs"
            style={{ color: "var(--gg-muted)" }}
          >
            Refreshing your CV from the call…
          </p>
        )}
      </div>
    </div>
  );
}

function CallControlCard({
  phase,
  onStart,
  onStop,
  error,
}: {
  phase: Phase;
  onStart: () => void;
  onStop: () => void;
  error: string | null;
}) {
  const isLive = phase === "live";
  const isStarting = phase === "starting";
  return (
    <div
      className="rounded-2xl border bg-white p-6"
      style={{
        borderColor: "var(--gg-line)",
        boxShadow:
          "0 30px 80px -50px rgba(14,40,22,0.18), 0 2px 6px rgba(14,40,22,0.04)",
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="relative grid h-14 w-14 flex-shrink-0 place-items-center rounded-full text-white"
          style={{
            background:
              phase === "error"
                ? "#E63946"
                : isLive
                  ? "var(--gg-green)"
                  : "var(--gg-ink)",
          }}
        >
          <IconMic width={22} height={22} />
          {isLive && (
            <>
              <span
                className="absolute inset-0 rounded-full border-2"
                style={{
                  borderColor: "var(--gg-green)",
                  animation: "pulseRing 1.8s ease-out infinite",
                }}
              />
              <span
                className="absolute inset-0 rounded-full border-2"
                style={{
                  borderColor: "var(--gg-green)",
                  animation: "pulseRing 1.8s ease-out infinite",
                  animationDelay: "0.6s",
                }}
              />
            </>
          )}
        </div>
        <div className="flex-1">
          <div
            className="mono text-xs font-semibold uppercase"
            style={{
              color:
                phase === "error"
                  ? "#9B1C29"
                  : isLive
                    ? "var(--gg-green-dark)"
                    : "var(--gg-muted)",
              letterSpacing: "0.14em",
            }}
          >
            {phase === "idle" && "Ready when you are"}
            {phase === "starting" && "Connecting…"}
            {phase === "live" && "On the call · listening"}
            {phase === "ended" && "Call ended"}
            {phase === "error" && "Something went wrong"}
          </div>
          <h2
            className="m-0 mt-1 text-xl font-extrabold tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            {isLive
              ? "Talk normally. Sarah can hear you."
              : phase === "ended"
                ? "We're building your CV from this call."
                : "Talk to Sarah from your browser"}
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--gg-muted)" }}
          >
            Same intake as the hotline — uses your device microphone instead
            of a phone line. Headphones recommended.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {phase === "idle" || phase === "ended" || phase === "error" ? (
          <button
            type="button"
            onClick={onStart}
            disabled={isStarting}
            className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--gg-green)" }}
          >
            <IconMic width={16} height={16} />
            {phase === "idle" ? "Start" : "Start again"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            disabled={!isLive}
            className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--gg-ink)" }}
          >
            <IconClose width={14} height={14} />
            End call
          </button>
        )}
        <Link
          href="/start"
          className="inline-flex h-12 items-center gap-2 rounded-xl border-[1.5px] bg-white px-5 text-sm font-semibold"
          style={{
            borderColor: "var(--gg-line-2)",
            color: "var(--gg-ink)",
          }}
        >
          <IconPhone width={14} height={14} /> Or call me on my phone
        </Link>
      </div>

      {error && (
        <p
          className="mt-4 rounded-md px-3 py-2 text-sm"
          style={{
            background: "rgba(230,57,70,0.08)",
            color: "#9B1C29",
          }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function TranscriptCard({
  phase,
  turns,
}: {
  phase: Phase;
  turns: Turn[];
}) {
  if (phase === "idle") return null;
  const rows = dedupe(turns);
  return (
    <div
      className="rounded-2xl border bg-white"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderBottomColor: "var(--gg-line)" }}
      >
        <h3
          className="mono m-0 text-[11px] font-bold uppercase tracking-widest"
          style={{ color: "var(--gg-muted)", letterSpacing: "0.14em" }}
        >
          Live transcript
        </h3>
        <span
          className="text-[11px] font-semibold"
          style={{ color: "var(--gg-muted)" }}
        >
          {rows.length} turns
        </span>
      </header>
      <div
        className="space-y-2 overflow-y-auto px-4 py-3"
        style={{ maxHeight: 420 }}
      >
        {rows.length === 0 ? (
          <p
            className="py-4 text-center text-sm italic"
            style={{ color: "var(--gg-muted)" }}
          >
            The conversation appears here as you and Sarah speak.
          </p>
        ) : (
          rows.map((t, i) => <Bubble key={i} turn={t} />)
        )}
      </div>
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const isAi = turn.speaker === "ai";
  return (
    <div className={`flex ${isAi ? "justify-start" : "justify-end"}`}>
      <div
        className="max-w-[82%] rounded-2xl px-3 py-1.5 text-[13.5px] font-medium leading-snug"
        style={{
          background: isAi ? "var(--gg-green-tint)" : "var(--gg-ink)",
          color: isAi ? "var(--gg-green-deep)" : "white",
          borderBottomLeftRadius: isAi ? 4 : 14,
          borderBottomRightRadius: isAi ? 14 : 4,
        }}
      >
        {turn.text}
      </div>
    </div>
  );
}

function dedupe(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.speaker === t.speaker) {
      out[out.length - 1] = {
        ...last,
        text: `${last.text} ${t.text}`.trim(),
      };
    } else {
      out.push(t);
    }
  }
  return out;
}
