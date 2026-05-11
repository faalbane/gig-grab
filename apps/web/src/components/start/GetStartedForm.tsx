"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LanguagePicker } from "./LanguagePicker";
import { LANGUAGES, findLanguage, type LanguageEntry } from "@/lib/languages";
import { PhoneE164Input } from "@/components/common/PhoneE164Input";
import { GoogleLogo } from "@/components/auth/GoogleLogo";
import { IconPhone, IconArrow } from "@/components/marketing/hotline/icons";
import {
  signInWithGoogle,
  startEmailMagicLink,
  postAuthLink,
} from "@/lib/firebase";

type Audience = "worker" | "employer";

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

function GetStartedFormInner() {
  const params = useSearchParams();
  const audience: Audience =
    (params.get("audience") as Audience) ?? "worker";
  const isWorker = audience === "worker";

  const [language, setLanguage] = useState<LanguageEntry>(findLanguage("en")!);
  const [e164, setE164] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const onPhoneChange = useCallback((v: string, ok: boolean) => {
    setE164(v);
    setPhoneValid(ok);
  }, []);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [authBusy, setAuthBusy] = useState<string | null>(null);

  const valid = phoneValid && consent;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: e164,
          language: language.code,
          audience,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }
      const qs = new URLSearchParams({
        sessionId: data.sessionId,
        token: data.token ?? "",
        lang: language.code,
        e164,
        audience,
      });
      window.location.href = `/calling?${qs.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  async function googleSignIn() {
    setAuthBusy("google");
    setError(null);
    try {
      const cred = await signInWithGoogle();
      const token = await cred.user.getIdToken();
      await postAuthLink(token, undefined);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setAuthBusy(null);
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setAuthBusy("email");
    setError(null);
    try {
      await startEmailMagicLink(email);
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the link.");
    } finally {
      setAuthBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* LEFT: brand aside */}
      <aside
        className="relative flex flex-col justify-between overflow-hidden px-7 py-10 text-white sm:px-14 sm:py-12"
        style={{
          background:
            "linear-gradient(160deg, var(--gg-green) 0%, var(--gg-green-dark) 60%, var(--gg-green-deep) 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.18) 0%, transparent 35%), radial-gradient(circle at 85% 90%, rgba(255,255,255,0.12) 0%, transparent 40%), repeating-linear-gradient(135deg, transparent 0 60px, rgba(255,255,255,0.04) 60px 61px)",
          }}
        />

        <Link href="/" className="relative inline-flex items-center gap-2.5">
          <span
            className="grid h-[38px] w-[38px] place-items-center rounded-[9px] text-[15px] font-extrabold"
            style={{
              background: "white",
              color: "var(--gg-green-dark)",
              letterSpacing: "-0.02em",
            }}
          >
            GG
          </span>
          <span className="text-[19px] font-extrabold tracking-tight">
            GigGrab
          </span>
        </Link>

        <div className="relative">
          <div
            className="mb-7 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{
              background: "rgba(255,255,255,0.12)",
              borderColor: "rgba(255,255,255,0.18)",
              letterSpacing: "0.08em",
            }}
          >
            <span>📞</span> The voice-first hotline
          </div>
          <h1
            className="m-0 mb-4 font-extrabold leading-[1.04] tracking-tight"
            style={{ fontSize: "clamp(34px, 4vw, 52px)" }}
          >
            {isWorker ? (
              <>
                Two minutes on the phone.
                <br />
                <em
                  className="not-italic font-semibold"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  Then we get to work.
                </em>
              </>
            ) : (
              <>
                Five minutes on the phone.
                <br />
                <em
                  className="not-italic font-semibold"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  Then we staff your role.
                </em>
              </>
            )}
          </h1>
          <p
            className="m-0 max-w-[460px] text-[17px] leading-relaxed"
            style={{ color: "rgba(255,255,255,0.82)" }}
          >
            {isWorker
              ? "Tell us your number. Our AI rings you, asks a few questions in your language, and matches you to live roles before you hang up."
              : "Tell us your number. Our AI rings you, takes the brief, and sends you ranked candidates within the hour."}
          </p>

          <div
            className="mt-8 flex max-w-[460px] items-center gap-3.5 rounded-2xl border p-4"
            style={{
              background: "rgba(255,255,255,0.07)",
              backdropFilter: "blur(10px)",
              borderColor: "rgba(255,255,255,0.16)",
            }}
          >
            <div
              className="relative grid h-11 w-11 flex-shrink-0 place-items-center rounded-full"
              style={{ background: "white", color: "var(--gg-green-dark)" }}
            >
              <IconPhone width={20} height={20} />
              <span
                className="absolute inset-[-4px] rounded-full border-2"
                style={{
                  borderColor: "rgba(255,255,255,0.6)",
                  animation: "pulseRing 1.9s ease-out infinite",
                }}
              />
              <span
                className="absolute inset-[-4px] rounded-full border-2"
                style={{
                  borderColor: "rgba(255,255,255,0.6)",
                  animation: "pulseRing 1.9s ease-out infinite",
                  animationDelay: "0.6s",
                }}
              />
            </div>
            <div>
              <div className="text-[14.5px] font-bold">
                We&apos;ll call you from {HOTLINE}
              </div>
              <div
                className="mono mt-0.5 text-[12.5px] tracking-wider"
                style={{ opacity: 0.75 }}
              >
                Avg. {isWorker ? "2-min" : "5-min"} intake · free · 32 languages
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3">
            <ReassureLine>
              {isWorker
                ? "No CV. No forms. No app to download."
                : "No long briefs. No platform login required."}
            </ReassureLine>
            <ReassureLine>Your data stays yours. GDPR-aligned.</ReassureLine>
            <ReassureLine>
              {isWorker ? "Free for workers. Always." : "Free until you hire."}
            </ReassureLine>
          </div>
        </div>

        <div
          className="relative text-[12.5px]"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          Prefer to dial in? Call{" "}
          <a
            href={`tel:${HOTLINE.replace(/\s/g, "")}`}
            className="mono underline underline-offset-[3px]"
            style={{
              color: "white",
              textDecorationColor: "rgba(255,255,255,0.4)",
            }}
          >
            {HOTLINE}
          </a>{" "}
          anytime.
        </div>
      </aside>

      {/* RIGHT: form */}
      <main className="flex items-center justify-center px-6 py-10 sm:px-12 sm:py-14">
        <form onSubmit={onSubmit} className="w-full max-w-[460px]">
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{
              background: "var(--gg-green-tint)",
              color: "var(--gg-green-dark)",
              letterSpacing: "0.06em",
            }}
          >
            📞 Get started in 30 seconds
          </div>
          <h2
            className="m-0 mb-2.5 text-[32px] font-extrabold leading-tight tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            What&apos;s your number?
          </h2>
          <p
            className="m-0 mb-6 text-[15.5px] leading-snug"
            style={{ color: "var(--gg-muted)" }}
          >
            {isWorker
              ? "Drop your phone and our AI will call you right now. We'll match you to live roles before you hang up — no CV, no forms."
              : "Drop your phone and our AI will call you right now. We'll capture the brief and send you ranked candidates within the hour."}
          </p>

          {/* Phone block — bordered green with "Recommended" badge */}
          <div
            className="relative rounded-2xl border-2 p-5 sm:p-6"
            style={{
              borderColor: "var(--gg-green)",
              background: "white",
              boxShadow:
                "0 18px 40px -28px rgba(14,159,74,0.45), 0 2px 4px rgba(14,40,22,0.04)",
            }}
          >
            <span
              className="absolute -top-3 left-5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-widest text-white"
              style={{
                background: "var(--gg-green)",
                letterSpacing: "0.1em",
              }}
            >
              Recommended
            </span>

            <label
              className="block text-[12.5px] font-semibold"
              style={{ color: "var(--gg-ink-2)" }}
            >
              Call me in
            </label>
            <div className="mt-1.5">
              <LanguagePicker
                value={language.code}
                onChange={(l) => setLanguage(l)}
              />
            </div>

            <label
              className="mt-4 block text-[12.5px] font-semibold"
              style={{ color: "var(--gg-ink-2)" }}
            >
              Mobile number
            </label>
            <div className="mt-1.5">
              <PhoneE164Input onChange={onPhoneChange} showPreview={false} />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 text-[13px] text-gray-700">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                I agree to receive a recorded call from GigGrab&apos;s AI
                recruiter and accept the{" "}
                <a
                  href="/legal/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="/legal/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!valid || submitting}
              className="mt-3 inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl text-base font-bold text-white disabled:opacity-40"
              style={{ background: "var(--gg-green)" }}
            >
              <IconPhone width={18} height={18} />
              {submitting ? "Calling…" : "Call me now"}
            </button>

            <div
              className="mt-3 flex items-center gap-2 text-[12.5px]"
              style={{ color: "var(--gg-muted)" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "#1FCE6A",
                  animation: "glowDot 1.6s ease-in-out infinite",
                }}
              />
              Our AI rings within 10 seconds
            </div>

            <div
              className="mt-3 rounded-2xl border p-3.5 text-[13.5px] leading-snug"
              style={{
                background: "var(--gg-green-tint-2)",
                borderColor: "var(--gg-line)",
                color: "var(--gg-ink-2)",
              }}
            >
              <p className="m-0">
                <NumBadge>1</NumBadge>You&apos;ll get a call from {HOTLINE}
              </p>
              <p className="m-0 mt-1">
                <NumBadge>2</NumBadge>
                {isWorker
                  ? "Tell us what you do, where, and when"
                  : "Walk us through the role you're filling"}
              </p>
              <p className="m-0 mt-1">
                <NumBadge>3</NumBadge>
                {isWorker
                  ? "Get matched and texted ranked roles"
                  : "Get a ranked shortlist within the hour"}
              </p>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div
            className="my-7 flex items-center gap-3.5 text-[11px] font-semibold uppercase"
            style={{
              color: "var(--gg-muted)",
              letterSpacing: "0.18em",
            }}
          >
            <span
              className="h-px flex-1"
              style={{ background: "var(--gg-line)" }}
            />
            Or sign in another way
            <span
              className="h-px flex-1"
              style={{ background: "var(--gg-line)" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={googleSignIn}
              disabled={authBusy !== null}
              className="inline-flex h-[48px] items-center justify-center gap-2 rounded-xl border-[1.5px] bg-white text-[14.5px] font-semibold disabled:opacity-60"
              style={{
                borderColor: "var(--gg-line-2)",
                color: "var(--gg-ink)",
              }}
            >
              <GoogleLogo />
              {authBusy === "google" ? "Signing in…" : "Continue with Google"}
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-[48px] cursor-not-allowed items-center justify-center gap-2 rounded-xl border-[1.5px] bg-white text-[14.5px] font-semibold"
              style={{
                borderColor: "var(--gg-line-2)",
                color: "var(--gg-muted)",
              }}
            >
              <LinkedInIcon /> LinkedIn{" "}
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: "var(--gg-line)",
                  color: "var(--gg-muted)",
                }}
              >
                Soon
              </span>
            </button>
          </div>

          {/* Magic link */}
          {emailSent ? (
            <div
              className="mt-4 rounded-xl p-3.5 text-sm"
              style={{
                background: "var(--gg-green-tint-2)",
                color: "var(--gg-green-deep)",
              }}
            >
              ✉️ Magic link sent to <strong>{email}</strong>. Check your inbox.
            </div>
          ) : (
            <form onSubmit={emailLink} className="mt-3.5">
              <input
                className="h-[48px] w-full rounded-xl border-[1.5px] px-3.5 text-[15px] outline-none"
                style={{
                  borderColor: "var(--gg-line-2)",
                  color: "var(--gg-ink)",
                }}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="…or just type your email"
              />
              <button
                type="submit"
                disabled={!email.includes("@") || authBusy !== null}
                className="mt-2.5 inline-flex h-11 w-full items-center justify-center gap-1.5 text-[14px] font-semibold disabled:opacity-50"
                style={{ background: "transparent", color: "var(--gg-muted)" }}
              >
                {authBusy === "email"
                  ? "Sending…"
                  : "Send a magic link instead "}
                <IconArrow width={14} height={14} />
              </button>
            </form>
          )}

          <p
            className="mt-7 text-[12.5px] leading-relaxed"
            style={{ color: "var(--gg-muted)" }}
          >
            By continuing you agree to our{" "}
            <a
              href="/legal/terms"
              className="underline underline-offset-2"
              style={{ color: "var(--gg-ink-2)" }}
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="/legal/privacy"
              className="underline underline-offset-2"
              style={{ color: "var(--gg-ink-2)" }}
            >
              Privacy Policy
            </a>
            . We may text or call you about your matches — message rates may
            apply. Reply STOP to opt out anytime.
          </p>

          <p
            className="mt-5 text-center text-[14px]"
            style={{ color: "var(--gg-muted)" }}
          >
            Already a member?{" "}
            <Link
              href="/auth"
              className="font-bold"
              style={{ color: "var(--gg-ink)" }}
            >
              Log in →
            </Link>
          </p>

          {/* Invisible reCAPTCHA target — required by Firebase phone auth. */}
          <div id="phone-auth-recaptcha" />

          {/* Languages strip (reference; not from design but useful) */}
          <p
            className="mt-3 text-center text-[11.5px]"
            style={{ color: "var(--gg-muted)" }}
            aria-hidden
          >
            Speak any of {LANGUAGES.length}+ languages.
          </p>
        </form>
      </main>
    </div>
  );
}

function ReassureLine({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 text-[14.5px]"
      style={{ color: "rgba(255,255,255,0.85)" }}
    >
      <span
        className="grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-full"
        style={{ background: "rgba(255,255,255,0.18)" }}
      >
        <svg
          width={11}
          height={11}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      {children}
    </div>
  );
}

function NumBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono mr-1.5 inline-grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold text-white"
      style={{ background: "var(--gg-green)" }}
    >
      {children}
    </span>
  );
}

function LinkedInIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#5C6E62"
        d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 18H6V10h2.5v8zM7.25 8.7a1.45 1.45 0 1 1 0-2.9 1.45 1.45 0 0 1 0 2.9zM18 18h-2.5v-4.3c0-1-.4-1.7-1.3-1.7-.7 0-1.1.5-1.3 1-.06.2-.07.4-.07.6V18H10.3s.03-7.3 0-8h2.5v1.1c.33-.5.93-1.3 2.3-1.3 1.6 0 2.9 1 2.9 3.3V18z"
      />
    </svg>
  );
}

export function GetStartedForm() {
  return (
    <Suspense
      fallback={
        <div
          className="grid min-h-screen place-items-center text-sm"
          style={{ color: "var(--gg-muted)" }}
        >
          Loading…
        </div>
      }
    >
      <GetStartedFormInner />
    </Suspense>
  );
}
