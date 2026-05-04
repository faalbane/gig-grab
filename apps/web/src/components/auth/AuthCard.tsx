"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  signInWithGoogle,
  signInWithMicrosoft,
  startEmailMagicLink,
  postAuthLink,
} from "@/lib/firebase";

type Audience = "worker" | "employer";

function AuthCardInner() {
  const params = useSearchParams();
  const audience = (params.get("audience") as Audience) ?? "worker";
  const candidateId = params.get("candidateId") ?? undefined;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function googleSignIn() {
    setBusy("google");
    setError(null);
    try {
      const cred = await signInWithGoogle();
      const token = await cred.user.getIdToken();
      await postAuthLink(token, candidateId);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(null);
    }
  }

  async function microsoftSignIn() {
    setBusy("ms");
    setError(null);
    try {
      const cred = await signInWithMicrosoft();
      const token = await cred.user.getIdToken();
      await postAuthLink(token, candidateId);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(null);
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setBusy("email");
    setError(null);
    try {
      await startEmailMagicLink(email);
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the link.");
    } finally {
      setBusy(null);
    }
  }

  const heading =
    audience === "worker"
      ? "Where should we send everything?"
      : "Where should we send matches?";
  const sub =
    audience === "worker"
      ? "We'll use this for your CV, application updates, and new matches. Connect an account to speed things up — or just type your email."
      : "We'll alert you the moment vetted candidates match your role. Connect a calendar so AI interviews can be auto-scheduled.";

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        ✨ One last thing
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-gray-900">{heading}</h1>
      <p className="mt-2 text-sm text-gray-600">{sub}</p>

      {emailSent ? (
        <div className="mt-6 rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
          ✉️ Check <strong>{email}</strong> for a sign-in link. (You can close
          this tab.)
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={googleSignIn}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium hover:border-gray-400 disabled:opacity-60"
            >
              <span aria-hidden>🇬</span>
              {busy === "google" ? "…" : "Continue with Google"}
            </button>
            {audience === "employer" ? (
              <button
                type="button"
                onClick={microsoftSignIn}
                disabled={busy !== null}
                className="flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium hover:border-gray-400 disabled:opacity-60"
              >
                <span aria-hidden>Ⓜ</span>
                {busy === "ms" ? "…" : "Continue with Microsoft"}
              </button>
            ) : (
              <button
                type="button"
                disabled
                title="LinkedIn sign-in is coming soon."
                className="flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-400"
              >
                <span aria-hidden>in</span>
                LinkedIn (soon)
              </button>
            )}
          </div>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            or use email
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <form onSubmit={emailLink} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jake@example.com"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!email.includes("@") || busy !== null}
              className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-300"
            >
              {busy === "email" ? "Sending…" : "Send magic link →"}
            </button>
          </form>
        </>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="mt-6 text-xs text-gray-500">
        We only email about your applications. No spam — unsubscribe any time.
      </p>
    </div>
  );
}

export function AuthCard() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <AuthCardInner />
    </Suspense>
  );
}
