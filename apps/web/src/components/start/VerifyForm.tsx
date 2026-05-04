"use client";

import { useState } from "react";
import { LanguagePicker } from "./LanguagePicker";
import { LANGUAGES, findLanguage, type LanguageEntry } from "@/lib/languages";

const COUNTRY_CODES = [
  { code: "+1", flag: "🇺🇸", country: "US" },
  { code: "+44", flag: "🇬🇧", country: "UK" },
  { code: "+1", flag: "🇨🇦", country: "Canada" },
  { code: "+353", flag: "🇮🇪", country: "Ireland" },
  { code: "+61", flag: "🇦🇺", country: "Australia" },
  { code: "+34", flag: "🇪🇸", country: "Spain" },
  { code: "+33", flag: "🇫🇷", country: "France" },
  { code: "+49", flag: "🇩🇪", country: "Germany" },
  { code: "+39", flag: "🇮🇹", country: "Italy" },
  { code: "+351", flag: "🇵🇹", country: "Portugal" },
  { code: "+91", flag: "🇮🇳", country: "India" },
  { code: "+63", flag: "🇵🇭", country: "Philippines" },
  { code: "+52", flag: "🇲🇽", country: "Mexico" },
  { code: "+48", flag: "🇵🇱", country: "Poland" },
  { code: "+40", flag: "🇷🇴", country: "Romania" },
  { code: "+380", flag: "🇺🇦", country: "Ukraine" },
];

type Props = { audience: "worker" | "employer" };

export function VerifyForm({ audience }: Props) {
  const [language, setLanguage] = useState<LanguageEntry>(findLanguage("en")!);
  const [countryCode, setCountryCode] = useState("+1");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = phone.replace(/\D/g, "").length >= 7 && consent;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const e164 = `${countryCode}${phone.replace(/\D/g, "")}`;
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
        <div className="mt-1.5 flex gap-2">
          <select
            aria-label="Country code"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {COUNTRY_CODES.map((c, i) => (
              <option key={`${c.code}-${i}`} value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            required
          />
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
          I agree to receive a call from GigGrab&apos;s AI recruiter and accept
          the <a className="underline">privacy terms</a>.
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
