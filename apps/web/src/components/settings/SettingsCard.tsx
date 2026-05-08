"use client";

import { useEffect, useState } from "react";
import {
  useAuthUser,
  fetchWithAuth,
  signOutCurrentUser,
} from "@/lib/firebase";

type Me = {
  candidate: {
    id: string;
    phone: string | null;
    email: string | null;
    language: string;
  };
};

type PhoneStep = "idle" | "code-sent";

// Mirrors apps/web/src/components/start/VerifyForm.tsx so the picker feels
// the same wherever a phone is entered.
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

/** Build E.164 from country code + raw national input. */
function toE164(country: string, raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Drop national-trunk leading 0 for everything except +1 (NANP — no leading 0 to strip).
  if (country !== "+1" && digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return `${country}${digits}`;
}

export function SettingsCard() {
  const user = useAuthUser();
  const [me, setMe] = useState<Me | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Phone-link form state
  const [countryIndex, setCountryIndex] = useState(0); // 0 = US +1
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<PhoneStep>("idle");
  const [busy, setBusy] = useState(false);
  const country = COUNTRY_CODES[countryIndex];
  const e164 = toE164(country.code, phone);
  const valid = /^\+[1-9]\d{6,14}$/.test(e164);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [phoneOk, setPhoneOk] = useState<string | null>(null);

  // Load /account/me when user is authed.
  useEffect(() => {
    if (user === null || user === false) return;
    fetchWithAuth<Me>("/api/account/me")
      .then(setMe)
      .catch((e: Error) => setLoadErr(e.message));
  }, [user]);

  if (user === null) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (user === false) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-700">You&apos;re not signed in.</p>
        <a
          href="/auth"
          className="mt-3 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          Sign in →
        </a>
      </div>
    );
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setPhoneErr("That doesn't look like a valid phone number.");
      return;
    }
    setBusy(true);
    setPhoneErr(null);
    setPhoneOk(null);
    try {
      await fetchWithAuth("/api/account/phone/start", {
        method: "POST",
        body: JSON.stringify({ phone: e164 }),
      });
      setStep("code-sent");
    } catch (err) {
      setPhoneErr(err instanceof Error ? err.message : "Couldn't send code.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPhoneErr(null);
    try {
      const res = await fetchWithAuth<{ ok: boolean; phone: string }>(
        "/api/account/phone/confirm",
        {
          method: "POST",
          body: JSON.stringify({ phone: e164, code }),
        },
      );
      setPhoneOk(`Linked ${res.phone}.`);
      setStep("idle");
      setCode("");
      // Refresh /me
      const fresh = await fetchWithAuth<Me>("/api/account/me");
      setMe(fresh);
    } catch (err) {
      setPhoneErr(err instanceof Error ? err.message : "Code didn't verify.");
    } finally {
      setBusy(false);
    }
  }

  const linkedPhone = me?.candidate.phone ?? null;

  return (
    <div className="space-y-6">
      {loadErr && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadErr}
        </p>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Account</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <Row k="Signed in as" v={user.displayName ?? user.email ?? user.phoneNumber ?? "—"} />
          <Row k="Email" v={user.email ?? "—"} />
        </dl>
        <button
          type="button"
          onClick={async () => {
            await signOutCurrentUser();
            window.location.href = "/";
          }}
          className="mt-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:border-gray-400"
        >
          Sign out
        </button>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Phone number</h2>
        <p className="mt-1 text-xs text-gray-600">
          We&apos;ll text you when employers respond and when matches go live.
        </p>

        {linkedPhone ? (
          <div className="mt-4 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm">
            <span className="text-emerald-900">
              ✓ Linked: <strong>{linkedPhone}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setPhone("");
                setStep("idle");
                setPhoneOk(null);
              }}
              className="text-xs text-emerald-700 hover:text-emerald-900"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠️ No phone on file. Add one so we can reach you.
          </div>
        )}

        {(!linkedPhone || step !== "idle" || phone) && (
          <div className="mt-4 space-y-3">
            {step === "idle" ? (
              <form onSubmit={sendCode} className="space-y-2">
                <div className="flex gap-2">
                  <select
                    aria-label="Country code"
                    value={countryIndex}
                    onChange={(e) => setCountryIndex(Number(e.target.value))}
                    className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {COUNTRY_CODES.map((c, i) => (
                      <option key={`${c.country}-${i}`} value={i}>
                        {c.flag} {c.code} {c.country}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={country.code === "+1" ? "(415) 555-1234" : "07123 456789"}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <p className="px-1 text-[11px] text-gray-500">
                  Will text to <span className="font-mono">{valid ? e164 : "—"}</span>
                </p>
                <button
                  type="submit"
                  disabled={busy || !valid}
                  className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
                >
                  {busy ? "Sending…" : "Send code →"}
                </button>
              </form>
            ) : (
              <form onSubmit={confirm} className="space-y-2">
                <p className="text-xs text-gray-600">
                  Code sent to <strong>{e164}</strong>.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tracking-widest"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("idle");
                      setCode("");
                    }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={busy || code.length < 4}
                    className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
                  >
                    {busy ? "Verifying…" : "Verify & link →"}
                  </button>
                </div>
              </form>
            )}

            {phoneOk && (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {phoneOk}
              </p>
            )}
            {phoneErr && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {phoneErr}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-gray-900">{v}</dd>
    </div>
  );
}
