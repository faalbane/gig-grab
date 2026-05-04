"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { findLanguage } from "@/lib/languages";

function CallingCardInner() {
  const params = useSearchParams();
  const e164 = params.get("e164") ?? "+44 0000 000000";
  const langCode = params.get("lang") ?? "en";
  const audience = params.get("audience") ?? "worker";
  const sessionId = params.get("sessionId") ?? "";
  const token = params.get("token") ?? "";
  const language = findLanguage(langCode);

  const profileHref =
    sessionId && token
      ? `/profile?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`
      : "/profile";

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % 100), 1200);
    return () => clearInterval(id);
  }, []);

  const sub =
    audience === "worker"
      ? "Pick up — your AI recruiter is on the line."
      : "Pick up — we'll learn about the role you're hiring for.";

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <div className="relative mx-auto h-24 w-24">
        <div
          className={`absolute inset-0 rounded-full bg-emerald-200 transition-transform duration-1000 ease-out ${
            pulse % 2 ? "scale-110 opacity-50" : "scale-100 opacity-80"
          }`}
        />
        <div className="absolute inset-2 grid place-items-center rounded-full bg-emerald-600 text-3xl text-white shadow-lg">
          📞
        </div>
      </div>

      <p className="mt-8 text-2xl font-semibold tracking-tight text-gray-900">
        Calling {e164}…
      </p>
      <p className="mt-3 text-sm text-gray-600">{sub}</p>

      {language && (
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
          <span>{language.flag}</span>
          <span>Speaking {language.name}</span>
        </div>
      )}

      <a
        href={profileHref}
        className="mt-8 block w-full rounded-md bg-gray-900 px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        I&apos;ve answered → continue
      </a>

      <button
        type="button"
        className="mt-3 text-xs text-gray-500 hover:text-gray-700"
      >
        Didn&apos;t get the call?
      </button>
    </div>
  );
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
