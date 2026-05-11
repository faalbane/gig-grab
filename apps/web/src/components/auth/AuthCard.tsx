"use client";

import { useCallback, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import {
  signInWithGoogle,
  startEmailMagicLink,
  startPhoneSignIn,
  confirmPhoneCode,
  postAuthLink,
} from "@/lib/firebase";
import { PhoneE164Input } from "@/components/common/PhoneE164Input";
import { GoogleLogo } from "./GoogleLogo";
import { IconPhone, IconArrow } from "@/components/marketing/hotline/icons";

type Audience = "worker" | "employer";
type Tab = "phone" | "email";

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

function AuthCardInner() {
  const params = useSearchParams();
  const audience = (params.get("audience") as Audience) ?? "worker";
  const candidateId = params.get("candidateId") ?? undefined;

  const [tab, setTab] = useState<Tab>("phone");
  const [email, setEmail] = useState("");
  const [e164, setE164] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const onPhoneChange = useCallback((v: string, ok: boolean) => {
    setE164(v);
    setPhoneValid(ok);
  }, []);
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null,
  );
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

  async function phoneSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneValid) {
      setError("That doesn't look like a valid phone number.");
      return;
    }
    setBusy("phone");
    setError(null);
    try {
      const conf = await startPhoneSignIn(e164);
      setConfirmation(conf);
    } catch (err) {
      setError(friendlyAuthError(err) ?? "Couldn't send the code.");
    } finally {
      setBusy(null);
    }
  }

  async function phoneVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmation || !/^\d{4,8}$/.test(code)) return;
    setBusy("phone");
    setError(null);
    try {
      const cred = await confirmPhoneCode(confirmation, code);
      const token = await cred.user.getIdToken();
      await postAuthLink(token, candidateId);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(
        friendlyAuthError(err) ??
          "That code didn't match. Double-check the SMS and try again.",
      );
      setCode("");
      setBusy(null);
    }
  }

  return (
    <div
      className="w-full max-w-[440px] rounded-3xl border bg-white p-8 sm:p-9"
      style={{
        borderColor: "var(--gg-line)",
        boxShadow:
          "0 30px 80px -40px rgba(14,40,22,0.22), 0 4px 12px rgba(14,40,22,0.04)",
      }}
    >
      <div
        className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11.5px] font-bold uppercase tracking-widest"
        style={{
          background: "var(--gg-green-tint)",
          color: "var(--gg-green-dark)",
          letterSpacing: "0.1em",
        }}
      >
        Welcome back
      </div>
      <h1
        className="m-0 mb-2 text-[30px] font-extrabold leading-tight tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        Log in to GigGrab
      </h1>
      <p
        className="m-0 mb-6 text-[15px] leading-snug"
        style={{ color: "var(--gg-muted)" }}
      >
        {audience === "employer"
          ? "Pick how you signed up. We'll get you back to your shortlists."
          : "Pick how you signed up. We'll get you back to your matches."}
      </p>

      {emailSent ? (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            background: "var(--gg-green-tint-2)",
            color: "var(--gg-green-deep)",
          }}
        >
          ✉️ Check <strong>{email}</strong> for a sign-in link. (You can close
          this tab.)
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div
            className="mb-4 inline-flex rounded-xl border p-1"
            style={{
              background: "var(--gg-bg)",
              borderColor: "var(--gg-line)",
            }}
          >
            <TabButton
              active={tab === "phone"}
              onClick={() => setTab("phone")}
              label="Phone"
              icon={<IconPhone width={14} height={14} />}
            />
            <TabButton
              active={tab === "email"}
              onClick={() => setTab("email")}
              label="Email"
              icon={<EmailIcon />}
            />
          </div>

          {tab === "phone" && !confirmation && (
            <form onSubmit={phoneSendCode} className="space-y-3">
              <label
                className="block text-[12.5px] font-semibold"
                style={{ color: "var(--gg-ink-2)" }}
              >
                Phone number
              </label>
              <PhoneE164Input onChange={onPhoneChange} showPreview={false} />
              <button
                type="submit"
                disabled={busy !== null || !phoneValid}
                className="mt-1 inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-xl text-[15.5px] font-bold text-white disabled:opacity-40"
                style={{ background: "var(--gg-ink)" }}
              >
                {busy === "phone" ? "Sending code…" : "Text me a code"}
                <IconArrow width={14} height={14} />
              </button>
            </form>
          )}

          {tab === "phone" && confirmation && (
            <form onSubmit={phoneVerify} className="space-y-3">
              <p className="text-xs" style={{ color: "var(--gg-muted)" }}>
                We sent a code to <strong>{e164}</strong>. Enter it below.
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  if (error) setError(null);
                }}
                placeholder="123456"
                required
                autoFocus
                aria-invalid={Boolean(error)}
                className="mono h-[50px] w-full rounded-xl border-[1.5px] px-3.5 text-center text-xl tracking-[0.4em] outline-none"
                style={{
                  borderColor: error ? "#E63946" : "var(--gg-line-2)",
                  boxShadow: error ? "0 0 0 3px rgba(230,57,70,0.15)" : undefined,
                }}
              />
              {error && (
                <p
                  className="rounded-md px-3 py-2 text-sm"
                  style={{
                    background: "rgba(230,57,70,0.08)",
                    color: "#9B1C29",
                  }}
                  role="alert"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!/^\d{4,8}$/.test(code) || busy !== null}
                className="inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-xl text-[15.5px] font-bold text-white disabled:opacity-40"
                style={{ background: "var(--gg-ink)" }}
              >
                {busy === "phone" ? "Verifying…" : "Verify & continue"}
                <IconArrow width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmation(null);
                  setCode("");
                  setError(null);
                }}
                className="w-full text-xs hover:underline"
                style={{ color: "var(--gg-muted)" }}
              >
                ← Use a different number
              </button>
            </form>
          )}

          {tab === "email" && (
            <form onSubmit={emailLink} className="space-y-3">
              <label
                className="block text-[12.5px] font-semibold"
                style={{ color: "var(--gg-ink-2)" }}
              >
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jake@example.com"
                required
                className="h-[50px] w-full rounded-xl border-[1.5px] px-3.5 text-[15.5px] outline-none"
                style={{ borderColor: "var(--gg-line-2)" }}
              />
              <button
                type="submit"
                disabled={!email.includes("@") || busy !== null}
                className="inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-xl text-[15.5px] font-bold text-white disabled:opacity-40"
                style={{ background: "var(--gg-ink)" }}
              >
                {busy === "email" ? "Sending…" : "Email me a magic link"}
                <IconArrow width={14} height={14} />
              </button>
            </form>
          )}

          <div
            className="my-6 flex items-center gap-3.5 text-[10.5px] font-bold uppercase"
            style={{
              color: "var(--gg-muted)",
              letterSpacing: "0.18em",
            }}
          >
            <span
              className="h-px flex-1"
              style={{ background: "var(--gg-line)" }}
            />
            Or
            <span
              className="h-px flex-1"
              style={{ background: "var(--gg-line)" }}
            />
          </div>

          <button
            type="button"
            onClick={googleSignIn}
            disabled={busy !== null}
            className="inline-flex h-[48px] w-full items-center justify-center gap-2.5 rounded-xl border-[1.5px] bg-white text-[14.5px] font-semibold disabled:opacity-60"
            style={{
              borderColor: "var(--gg-line-2)",
              color: "var(--gg-ink)",
            }}
          >
            <GoogleLogo />
            {busy === "google" ? "Signing in…" : "Continue with Google"}
          </button>

          {/* Hotline footnote */}
          <div
            className="mt-6 flex items-center gap-3 border-t pt-5"
            style={{
              borderTopStyle: "dashed",
              borderTopColor: "var(--gg-line)",
            }}
          >
            <div
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full"
              style={{
                background: "var(--gg-green-tint)",
                color: "var(--gg-green-dark)",
              }}
            >
              <IconPhone width={16} height={16} />
            </div>
            <div
              className="text-[13px] leading-snug"
              style={{ color: "var(--gg-muted)" }}
            >
              <strong
                className="block text-[13.5px] font-bold"
                style={{ color: "var(--gg-ink)" }}
              >
                Or just call the hotline
              </strong>
              <span>
                Dial{" "}
                <a
                  href={`tel:${HOTLINE.replace(/\s/g, "")}`}
                  className="mono font-semibold"
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  {HOTLINE}
                </a>{" "}
                — we&apos;ll match your number.
              </span>
            </div>
          </div>
        </>
      )}

      {/* Invisible reCAPTCHA target — required by Firebase phone auth.
          Phone-OTP errors render inline above the Verify button; this
          block catches errors from the Email + Google paths that don't
          have their own inline slot. */}
      <div id="phone-auth-recaptcha" />

      {error && !(tab === "phone" && confirmation) && (
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

      <p
        className="mt-6 text-center text-[14px]"
        style={{ color: "var(--gg-muted)" }}
      >
        New to GigGrab?{" "}
        <Link
          href="/start"
          className="font-bold"
          style={{ color: "var(--gg-ink)" }}
        >
          Get started →
        </Link>
      </p>
    </div>
  );
}

/** Map Firebase Auth error codes to user-friendly text. Returns null for
 * errors we don't recognise so the caller can fall back to a sensible
 * default. */
function friendlyAuthError(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-verification-code":
      return "That code didn't match. Check the SMS and try again.";
    case "auth/code-expired":
      return "The code expired. Tap 'Use a different number' to request a new one.";
    case "auth/missing-verification-code":
      return "Please enter the 6-digit code from the SMS.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a minute and try again.";
    case "auth/invalid-phone-number":
      return "That phone number doesn't look right.";
    case "auth/quota-exceeded":
      return "We've hit our SMS quota for now. Please try again shortly.";
    case "auth/network-request-failed":
      return "Network error — check your connection and try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in window closed before we could finish.";
    case "auth/cancelled-popup-request":
      return null; // benign — user cancelled, no need to alarm
    case "auth/account-exists-with-different-credential":
      return "That email is already linked to a different sign-in method.";
    default:
      return null;
  }
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-semibold transition-all"
      style={{
        background: active ? "white" : "transparent",
        color: active ? "var(--gg-ink)" : "var(--gg-muted)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function EmailIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4h16v16H4z" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function AuthCard() {
  return (
    <Suspense
      fallback={
        <div
          className="w-full max-w-[440px] rounded-3xl border bg-white p-8 text-center text-sm"
          style={{
            borderColor: "var(--gg-line)",
            color: "var(--gg-muted)",
          }}
        >
          Loading…
        </div>
      }
    >
      <AuthCardInner />
    </Suspense>
  );
}
