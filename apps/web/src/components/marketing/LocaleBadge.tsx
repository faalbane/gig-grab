"use client";

import { useEffect, useState } from "react";

type Locale = { flag: string; label: string };

const DEFAULT: Locale = { flag: "🌐", label: "English" };
const UK: Locale = { flag: "🇬🇧", label: "English (UK)" };
const US: Locale = { flag: "🇺🇸", label: "English (US)" };

const CACHE_KEY = "gg.locale.country";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function localeFor(country: string | null | undefined): Locale {
  if (!country) return DEFAULT;
  const c = country.toUpperCase();
  if (c === "GB" || c === "UK") return UK;
  if (c === "US") return US;
  return DEFAULT;
}

export function LocaleBadge() {
  const [locale, setLocale] = useState<Locale>(DEFAULT);

  useEffect(() => {
    let cancelled = false;

    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { country?: string; at?: number };
        if (parsed?.at && Date.now() - parsed.at < CACHE_TTL_MS) {
          setLocale(localeFor(parsed.country));
          return;
        }
      }
    } catch {
      // ignore
    }

    fetch("https://api.country.is/", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { country?: string } | null) => {
        if (cancelled || !data) return;
        const country = data.country ?? null;
        setLocale(localeFor(country));
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ country, at: Date.now() }),
          );
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // network failure → keep default
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
    >
      <span aria-hidden>{locale.flag}</span>
      <span>{locale.label}</span>
    </button>
  );
}
