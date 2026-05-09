"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAuthUser,
  fetchWithAuth,
  signInWithGoogle,
} from "@/lib/firebase";
import {
  startVoiceCall,
  type VoiceCallController,
} from "@/lib/web-voice";

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

export function VoiceCallView() {
  const user = useAuthUser();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StartResponse | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const sinceRef = useRef(0);
  const controllerRef = useRef<VoiceCallController | null>(null);

  // Live transcript — same polling pattern the phone /calling uses.
  useEffect(() => {
    if (!session || phase !== "live") return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(
          `/api/sessions/${session!.sessionId}/turns?since=${sinceRef.current}&token=${encodeURIComponent(session!.token)}`,
        );
        if (!res.ok) return;
        const j = (await res.json()) as { turns: Turn[] };
        const next = j.turns ?? [];
        if (!cancelled && next.length > 0) {
          setTurns((prev) => [...prev, ...next]);
          sinceRef.current = next[next.length - 1].ord + 1;
        }
      } catch {
        /* network blips; next tick will retry */
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, phase]);

  async function start() {
    if (user === null || user === false) return;
    setError(null);
    setPhase("starting");
    try {
      const j = await fetchWithAuth<StartResponse>(
        "/api/account/web-call/start",
        { method: "POST", body: JSON.stringify({ language: "en" }) },
      );
      setSession(j);
      const ctrl = await startVoiceCall(j.wsUrl, {
        onStateChange: (s) => {
          if (s === "live") setPhase("live");
          else if (s === "ended") setPhase("ended");
          else if (s === "error") {
            setError("Voice connection error.");
            setPhase("error");
          }
        },
        onError: (e) => setError(e.message),
      });
      controllerRef.current = ctrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start.");
      setPhase("error");
    }
  }

  async function stop() {
    await controllerRef.current?.end();
    setPhase("ended");
  }

  if (user === null) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (user === false) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <p className="text-sm text-gray-700">
          Sign in to use the browser microphone path. (Google or phone — both work.)
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await signInWithGoogle();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Sign-in failed.");
              }
            }}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Continue with Google
          </button>
          <a
            href="/auth"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm"
          >
            Other sign-in options
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-600 text-3xl text-white shadow-lg">
          🎙
        </div>
        <p className="mt-5 text-lg font-semibold">
          {phase === "idle" && "Ready when you are"}
          {phase === "starting" && "Connecting…"}
          {phase === "live" && "On the call"}
          {phase === "ended" && "Call ended"}
          {phase === "error" && "Something went wrong"}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {phase === "live"
            ? "Talk normally. Sarah can hear you. Click End when you're done."
            : "We'll ask for your microphone, then Sarah will guide you through 8 quick questions."}
        </p>

        {phase === "idle" || phase === "ended" || phase === "error" ? (
          <button
            type="button"
            onClick={start}
            className="mt-6 rounded-md bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {phase === "idle" ? "Start" : "Start again"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            disabled={phase !== "live"}
            className="mt-6 rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white disabled:bg-gray-300"
          >
            End call
          </button>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {(phase === "live" || phase === "ended") && session && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50">
          <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Live transcript
            </h3>
            <span className="text-[10px] uppercase tracking-wide text-gray-400">
              {turns.length} turns
            </span>
          </header>
          <div className="max-h-96 space-y-2 overflow-y-auto px-4 py-3">
            {turns.length === 0 ? (
              <p className="text-sm text-gray-400">
                The conversation appears here as you and Sarah speak.
              </p>
            ) : (
              dedupe(turns).map((t, i) => <Bubble key={i} turn={t} />)
            )}
          </div>
          {phase === "ended" && (
            <div className="border-t border-gray-100 p-3 text-right">
              <a
                href={`/profile?sessionId=${session.sessionId}&token=${encodeURIComponent(session.token)}`}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              >
                See my profile →
              </a>
            </div>
          )}
        </div>
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
          isAi
            ? "border border-gray-200 bg-white text-gray-900"
            : "bg-emerald-600 text-white"
        }`}
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
      out[out.length - 1] = { ...last, text: `${last.text} ${t.text}`.trim() };
    } else {
      out.push(t);
    }
  }
  return out;
}
