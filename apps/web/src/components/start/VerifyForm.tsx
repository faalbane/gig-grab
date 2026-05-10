"use client";

import { useCallback, useState } from "react";
import { LanguagePicker } from "./LanguagePicker";
import { LANGUAGES, findLanguage, type LanguageEntry } from "@/lib/languages";
import { PhoneE164Input } from "@/components/common/PhoneE164Input";

type Props = { audience: "worker" | "employer" };

export function VerifyForm({ audience }: Props) {
  const [language, setLanguage] = useState<LanguageEntry>(findLanguage("en")!);
  const [e164, setE164] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const onPhoneChange = useCallback((v: string, ok: boolean) => {
    setE164(v);
    setPhoneValid(ok);
  }, []);
  // GDPR: explicit consent — pre-ticked boxes are not valid (CNIL / ICO).
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const params = new URLSearchParams({
        sessionId: data.sessionId,
        token: data.token ?? "",
        lang: language.code,
        e164,
        audience,
      });
      window.location.href = `/calling?${params.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const headline =
    audience === "worker"
      ? "Let's verify your number"
      : "Let's set up your hiring call";
  const sub =
    audience === "worker"
      ? "We'll call you in a moment to chat about your work. No forms — just talk."
      : "We'll call you in a moment to learn about the role you're hiring for.";
  const ctaSuffix = audience === "worker" ? "in" : "in";
  const ctaLabel = `Call me ${ctaSuffix} ${language.name} →`;

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-2xl">
        📞
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-gray-900">{headline}</h1>
      <p className="mt-2 text-sm text-gray-600">{sub}</p>

      <div className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-900">
          🌍 Speak any language
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          Our AI recruiter is fluent in {LANGUAGES.length}+ languages — pick what
          you&apos;re most comfortable in.
        </p>
      </div>

      <div className="mt-6">
        <label className="text-xs font-medium text-gray-700">Call me in</label>
        <div className="mt-1.5">
          <LanguagePicker
            value={language.code}
            onChange={(l) => setLanguage(l)}
          />
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium text-gray-700">
          Mobile number
        </label>
        <div className="mt-1.5">
          <PhoneE164Input onChange={onPhoneChange} showPreview={false} />
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span>
          I agree to receive a recorded call from GigGrab&apos;s AI recruiter
          and accept the{" "}
          <a
            href="/legal/terms"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 underline hover:text-emerald-800"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/legal/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 underline hover:text-emerald-800"
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
        disabled={!valid || submitting}
        className="mt-6 w-full rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {submitting ? "Calling…" : ctaLabel}
      </button>

      <p className="mt-4 text-center text-xs text-gray-500">
        Free, ~2 minutes. We&apos;ll never share your number.
      </p>
    </form>
  );
}
