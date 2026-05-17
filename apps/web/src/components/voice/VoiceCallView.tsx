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
import { JobPreview, type JobDraft } from "@/components/voice/JobPreview";
import {
  IconPhone,
  IconMic,
  IconClose,
} from "@/components/marketing/hotline/icons";
import type { ProfileCard } from "@/lib/types";

type Audience = "worker" | "employer";

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

export function VoiceCallView({
  audience = "worker",
}: {
  audience?: Audience;
} = {}) {
  const user = useAuthUser();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StartResponse | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const sinceRef = useRef(0);
  const controllerRef = useRef<VoiceCallController | null>(null);
  const [me, setMe] = useState<AccountMe | null>(null);
  const startedAtRef = useRef<number>(0);
  // Live-snapshot bookkeeping. We trigger a server-side re-extract every
  // SNAPSHOT_TURN_DELTA new transcript turns, debounced so two snapshots
  // can't fire within SNAPSHOT_COOLDOWN_MS. Costs ~1 Anthropic call each
  // time but keeps the CV pane updating in near-real-time during the
  // call.
  const lastSnapshotTurnCountRef = useRef<number>(0);
  const lastSnapshotAtRef = useRef<number>(0);
  const SNAPSHOT_TURN_DELTA = 6;
  const SNAPSHOT_COOLDOWN_MS = 8000;
  const [snapshotting, setSnapshotting] = useState(false);
  const [jobDraft, setJobDraft] = useState<JobDraft | null>(null);
  const isEmployer = audience === "employer";

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

  // In-call snapshot loop. Mid-call we re-run Claude on the partial
  // transcript and refresh the right pane: CV for workers, JobDraft
  // for employers. Cost is one Anthropic call per snapshot, gated by
  // SNAPSHOT_TURN_DELTA + cooldown so a chatty caller doesn't fan out
  // requests.
  useEffect(() => {
    if (phase !== "live" || !session) return;
    const grew = turns.length - lastSnapshotTurnCountRef.current;
    const cooled = Date.now() - lastSnapshotAtRef.current >= SNAPSHOT_COOLDOWN_MS;
    if (grew < SNAPSHOT_TURN_DELTA || !cooled) return;
    lastSnapshotTurnCountRef.current = turns.length;
    lastSnapshotAtRef.current = Date.now();
    let cancelled = false;
    setSnapshotting(true);
    (async () => {
      try {
        if (isEmployer) {
          const resp = await fetchWithAuth<{ draft: JobDraft | null }>(
            `/api/sessions/${session.sessionId}/extract-job-snapshot`,
            { method: "POST" },
          );
          if (!cancelled && resp.draft) setJobDraft(resp.draft);
        } else {
          await fetchWithAuth(
            `/api/sessions/${session.sessionId}/extract-snapshot`,
            { method: "POST" },
          );
          if (cancelled) return;
          const data = await fetchWithAuth<AccountMe>("/api/account/me");
          if (!cancelled) setMe(data);
        }
      } catch {
        // benign — next snapshot tick will retry
      } finally {
        if (!cancelled) setSnapshotting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [turns.length, phase, session, isEmployer]);

  // Hard cleanup hooks. Without these, a tab close mid-call leaves the
  // mic LED on + the WS open until the browser eventually GCs the page
  // — bad UX (mobile shows mic indicator persistently) and small leak
  // server-side. Also tear down if the user signs out mid-call.
  useEffect(() => {
    const cleanup = () => {
      controllerRef.current?.end().catch(() => {});
    };
    window.addEventListener("pagehide", cleanup);
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      window.removeEventListener("beforeunload", cleanup);
    };
  }, []);

  useEffect(() => {
    if (user === false) {
      controllerRef.current?.end().catch(() => {});
    }
  }, [user]);

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
    lastSnapshotTurnCountRef.current = 0;
    lastSnapshotAtRef.current = 0;
    setPhase("starting");
    try {
      const j = await fetchWithAuth<StartResponse>(
        "/api/account/web-call/start",
        {
          method: "POST",
          body: JSON.stringify({ language: "en", audience }),
        },
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
    <div className="space-y-4">
      {/* Cross-page nav back to the main dashboard. Same pattern used
          on every profile-adjacent view so users always know how to
          jump back to Profile + Jobs without hunting in the header. */}
      <DashboardCrumb />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,440px)]">
        {/* LEFT — control + transcript. Order flips during a live call so
            the active conversation is the first thing visible above the
            fold. Pre-call / post-call the control card leads. */}
        <div className="space-y-4">
          {phase === "live" ? (
            <>
              <TranscriptCard phase={phase} turns={turns} />
              <CallControlCard
                phase={phase}
                onStart={start}
                onStop={stop}
                error={error}
                slim
              />
            </>
          ) : (
            <>
              <CallControlCard
                phase={phase}
                onStart={start}
                onStop={stop}
                error={error}
              />
              <TranscriptCard phase={phase} turns={turns} />
            </>
          )}
        </div>

        {/* RIGHT — live preview pane. Worker = CV being built. Employer = job posting being built. */}
        <div>
          {isEmployer ? (
            <JobPreview draft={jobDraft} updating={snapshotting} />
          ) : (
            <CvPreview
              card={me?.profile ?? null}
              email={me?.candidate.email ?? undefined}
              updating={snapshotting}
            />
          )}
          {phase === "live" && (
            <p
              className="mt-3 text-center text-[11.5px]"
              style={{ color: "var(--gg-muted)" }}
            >
              {isEmployer
                ? "Job posting refreshes as you talk."
                : "CV refreshes as you talk."}
            </p>
          )}
          {phase === "ended" && (
            <p
              className="mt-3 text-center text-xs"
              style={{ color: "var(--gg-muted)" }}
            >
              {isEmployer
                ? "Finalising your job posting…"
                : "Refreshing your CV from the call…"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardCrumb() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center gap-2 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold"
        style={{
          borderColor: "var(--gg-line-2)",
          color: "var(--gg-ink-2)",
        }}
      >
        ← Dashboard
      </Link>
      <div className="flex gap-1.5">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold"
          style={{
            background: "var(--gg-bg)",
            color: "var(--gg-ink-2)",
          }}
        >
          My profile
        </Link>
        <Link
          href="/dashboard?tab=jobs"
          className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold"
          style={{
            background: "var(--gg-bg)",
            color: "var(--gg-ink-2)",
          }}
        >
          Jobs
        </Link>
      </div>
    </div>
  );
}

function CallControlCard({
  phase,
  onStart,
  onStop,
  error,
  slim = false,
}: {
  phase: Phase;
  onStart: () => void;
  onStop: () => void;
  error: string | null;
  slim?: boolean;
}) {
  const isLive = phase === "live";
  const isStarting = phase === "starting";
  if (slim && isLive) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3"
        style={{ borderColor: "var(--gg-line)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="relative grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-white"
            style={{ background: "var(--gg-green)" }}
          >
            <IconMic width={14} height={14} />
            <span
              className="absolute inset-0 rounded-full border-2"
              style={{
                borderColor: "var(--gg-green)",
                animation: "pulseRing 1.8s ease-out infinite",
              }}
            />
          </div>
          <div
            className="mono text-xs font-semibold uppercase"
            style={{
              color: "var(--gg-green-dark)",
              letterSpacing: "0.14em",
            }}
          >
            On the call · listening
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white"
          style={{ background: "var(--gg-ink)" }}
        >
          <IconClose width={12} height={12} />
          End call
        </button>
      </div>
    );
  }
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rows = dedupe(turns);
  // Auto-scroll the transcript pane to the latest turn whenever new turns
  // arrive. Snaps to bottom so the user always sees the active exchange
  // without having to manually scroll the inner panel.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  if (phase === "idle") return null;
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
        ref={scrollRef}
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
          <>
            {rows.map((t, i) => <Bubble key={i} turn={t} />)}
            {phase === "live" &&
              rows.length > 0 &&
              rows[rows.length - 1]?.speaker === "candidate" && (
                <ThinkingDots />
              )}
          </>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Sarah is thinking">
      <div
        className="inline-flex items-center gap-1 rounded-2xl px-3 py-2"
        style={{ background: "var(--gg-bg)", color: "var(--gg-muted)" }}
      >
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
        <span className="ml-1 text-[11px]">Sarah is thinking…</span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{
        background: "var(--gg-green-dark)",
        animation: "ggThink 1s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
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
