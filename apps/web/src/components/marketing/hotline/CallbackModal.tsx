"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPhone, IconClose } from "./icons";
import { PhoneE164Input } from "@/components/common/PhoneE164Input";
import { LanguagePicker } from "@/components/start/LanguagePicker";
import { findLanguage, type LanguageEntry } from "@/lib/languages";

type Mode = "worker" | "employer";
type Phase = "form" | "ringing" | "error";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
};

export function CallbackModal({ open, onClose, mode }: Props) {
  const [phase, setPhase] = useState<Phase>("form");
  const [language, setLanguage] = useState<LanguageEntry>(findLanguage("en")!);
  const [e164, setE164] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPhoneChange = useCallback((v: string, ok: boolean) => {
    setE164(v);
    setPhoneValid(ok);
  }, []);

  useEffect(() => {
    if (!open) {
      setPhase("form");
      setError(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const valid = phoneValid && consent;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("ringing");
    try {
      const res = await fetch("/api/intake/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: e164,
          language: language.code,
          audience: mode,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }
      const params = new URLSearchParams({
        sessionId: data.sessionId,
        token: data.token ?? "",
        lang: language.code,
        e164,
        audience: mode,
      });
      // Give the ringing animation a beat so the transition isn't jarring.
      setTimeout(() => {
        window.location.href = `/calling?${params.toString()}`;
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("form");
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center px-6 py-6"
      style={{
        background: "rgba(8,20,12,0.55)",
        backdropFilter: "blur(6px)",
        animation: "slideUp 220ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[440px] rounded-[22px] bg-white p-7"
        style={{
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.35)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-lg"
          style={{ color: "var(--gg-muted)" }}
          aria-label="Close"
        >
          <IconClose width={16} height={16} />
        </button>

        {phase === "form" && (
          <form onSubmit={onSubmit}>
            <div
              className="mb-4 grid h-14 w-14 place-items-center rounded-full"
              style={{
                background: "var(--gg-green-tint)",
                color: "var(--gg-green-dark)",
              }}
            >
              <IconPhone width={22} height={22} />
            </div>
            <h2
              className="m-0 text-2xl font-extrabold tracking-tight"
              style={{ color: "var(--gg-ink)" }}
            >
              We&apos;ll call you in 10 seconds
            </h2>
            <p
              className="mb-5 mt-2 text-[14.5px] leading-snug"
              style={{ color: "var(--gg-muted)" }}
            >
              {mode === "worker"
                ? "Pop in your number. Our AI will ring you, ask a few questions, and match you to live roles — in any language."
                : "Pop in your number. Our AI will ring you, take the brief, then send you ranked candidates within the hour."}
            </p>

            <label
              className="text-xs font-semibold"
              style={{ color: "var(--gg-ink-2)" }}
            >
              Your name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-lg border-[1.5px] px-3.5 py-3 text-[15px] outline-none"
              style={{ borderColor: "var(--gg-line-2)" }}
            />

            <label
              className="mt-4 block text-xs font-semibold"
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
              className="mt-4 block text-xs font-semibold"
              style={{ color: "var(--gg-ink-2)" }}
            >
              Mobile number
            </label>
            <div className="mt-1.5">
              <PhoneE164Input onChange={onPhoneChange} showPreview={false} />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-gray-700">
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

            {error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!valid}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
              style={{ background: "var(--gg-green)" }}
            >
              <IconPhone width={16} height={16} /> Call me now
            </button>
            <div
              className="mt-3 text-center text-xs"
              style={{ color: "var(--gg-muted)" }}
            >
              Free · No card · 2-minute call
            </div>
          </form>
        )}

        {phase === "ringing" && (
          <div className="py-5 text-center">
            <div className="relative mx-auto mb-5 h-24 w-24">
              <div
                className="absolute inset-0 grid place-items-center rounded-full text-white"
                style={{ background: "var(--gg-green)" }}
              >
                <IconPhone width={36} height={36} />
              </div>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="absolute inset-0 rounded-full border-2"
                  style={{
                    borderColor: "var(--gg-green)",
                    animation: "pulseRing 1.8s ease-out infinite",
                    animationDelay: `${i * 0.5}s`,
                  }}
                />
              ))}
            </div>
            <div className="text-[22px] font-extrabold tracking-tight">
              Ringing {name || "you"}…
            </div>
            <div
              className="mono mt-1.5 text-sm"
              style={{ color: "var(--gg-muted)" }}
            >
              {e164}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
