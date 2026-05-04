"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/marketing/Header";
import { ConversationPane } from "./ConversationPane";
import { CvPreview } from "./CvPreview";
import type { ProfileResponse } from "@/lib/types";

const TERMINAL_STATUSES = new Set([
  "completed",
  "abandoned",
  "failed",
]);

function ProfileInner() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? params.get("session");
  const token = params.get("token") ?? "";
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session id.");
      return;
    }
    if (!token) {
      setError(
        "Missing access token. Please use the link we sent you, or call again from the start.",
      );
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/profile?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("This session link has expired.");
          }
          throw new Error(`Failed to load (${res.status}).`);
        }
        const json = (await res.json()) as ProfileResponse;
        if (cancelled) return;
        setData(json);

        // Stop polling once the call is finished AND we have the profile.
        if (json.profile && TERMINAL_STATUSES.has(json.session.status)) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load.");
      }
    }

    load();
    intervalRef.current = setInterval(load, 5000);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, token]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back
          </a>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
            Your profile
          </h1>
        </div>
        <a
          href={data ? `/dashboard?candidate=${data.candidate.id}` : "#"}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          See matches →
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8" style={{ minHeight: 600 }}>
        <ConversationPane turns={data?.transcript ?? []} />
        <CvPreview card={data?.profile ?? null} email={data?.candidate.email} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={
            data
              ? `/start?phone=${encodeURIComponent(data.candidate.phone)}`
              : "/start"
          }
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:border-gray-400"
        >
          🔁 Call again
        </a>
        <button className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:border-gray-400">
          ↑ Upload CV
        </button>
      </div>
    </main>
  );
}

export function ProfilePage() {
  return (
    <>
      <Header />
      <Suspense
        fallback={<div className="px-6 py-20 text-center text-gray-400">Loading…</div>}
      >
        <ProfileInner />
      </Suspense>
    </>
  );
}
