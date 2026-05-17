"use client";

import { useEffect, useState } from "react";

export const COUNTRY_CODES = [
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
  { code: "+92", flag: "🇵🇰", country: "Pakistan" },
  { code: "+63", flag: "🇵🇭", country: "Philippines" },
  { code: "+52", flag: "🇲🇽", country: "Mexico" },
  { code: "+48", flag: "🇵🇱", country: "Poland" },
  { code: "+40", flag: "🇷🇴", country: "Romania" },
  { code: "+380", flag: "🇺🇦", country: "Ukraine" },
];

const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Build E.164 from country code + raw national input. Drops trunk-leading 0
 * for non-NANP. */
export function toE164(country: string, raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (country !== "+1" && digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return `${country}${digits}`;
}

type Props = {
  /** Fired on every change; callers persist whatever they need. */
  onChange: (e164: string, isValid: boolean) => void;
  defaultCountryIndex?: number;
  defaultPhone?: string;
  /** If provided, splits an E.164 string into country index + national digits
   * and pre-fills both inputs. Useful for signed-in users who already have a
   * phone on file. */
  defaultE164?: string;
  /** Render a small "Will text to +…" preview line under the inputs. */
  showPreview?: boolean;
  inputId?: string;
  className?: string;
};

function splitE164(e164: string): { idx: number; rest: string } | null {
  if (!e164 || !e164.startsWith("+")) return null;
  // Try longest country code first to avoid matching "+1" inside "+44".
  const sorted = COUNTRY_CODES.map((c, i) => ({ ...c, i })).sort(
    (a, b) => b.code.length - a.code.length,
  );
  for (const c of sorted) {
    if (e164.startsWith(c.code)) {
      return { idx: c.i, rest: e164.slice(c.code.length) };
    }
  }
  return null;
}

export function PhoneE164Input({
  onChange,
  defaultCountryIndex = 0,
  defaultPhone = "",
  defaultE164,
  showPreview = true,
  inputId,
  className,
}: Props) {
  const seed = defaultE164 ? splitE164(defaultE164) : null;
  const [countryIndex, setCountryIndex] = useState(seed?.idx ?? defaultCountryIndex);
  const [phone, setPhone] = useState(seed?.rest ?? defaultPhone);
  const country = COUNTRY_CODES[countryIndex];
  const e164 = toE164(country.code, phone);
  const valid = E164_RE.test(e164);

  useEffect(() => {
    onChange(e164, valid);
  }, [e164, valid, onChange]);

  return (
    <div className={className}>
      <div className="flex gap-2">
        <select
          aria-label="Country code"
          value={countryIndex}
          onChange={(e) => setCountryIndex(Number(e.target.value))}
          className="rounded-md border border-gray-300 bg-white px-2 py-2.5 text-sm hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {COUNTRY_CODES.map((c, i) => (
            <option key={`${c.country}-${i}`} value={i}>
              {c.flag} {c.code} {c.country}
            </option>
          ))}
        </select>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={country.code === "+1" ? "(415) 555-1234" : "07123 456789"}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </div>
      {showPreview && (
        <p className="mt-1.5 px-1 text-[11px] text-gray-500">
          Will text to <span className="font-mono">{valid ? e164 : "—"}</span>
        </p>
      )}
    </div>
  );
}
