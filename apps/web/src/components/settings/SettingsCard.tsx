"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAuthUser,
  fetchWithAuth,
  signOutCurrentUser,
} from "@/lib/firebase";
import { PhoneE164Input } from "@/components/common/PhoneE164Input";
import { Avatar } from "@/components/common/Avatar";

type Me = {
  candidate: {
    id: string;
    phone: string | null;
    email: string | null;
    language: string;
  };
};

type PhoneStep = "idle" | "code-sent";

export function SettingsCard() {
  const user = useAuthUser();
  const [me, setMe] = useState<Me | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Phone-link form state
  const [e164, setE164] = useState("");
  const [valid, setValid] = useState(false);
  const onPhoneChange = useCallback((v: string, ok: boolean) => {
    setE164(v);
    setValid(ok);
  }, []);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<PhoneStep>("idle");
  const [busy, setBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [phoneOk, setPhoneOk] = useState<string | null>(null);

  // Delete-account state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function deleteAccount() {
    setDeleting(true);
    setDeleteErr(null);
    try {
      await fetchWithAuth("/api/account", { method: "DELETE" });
      await signOutCurrentUser();
      window.location.href = "/?deleted=1";
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "Couldn't delete account.");
      setDeleting(false);
    }
  }

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
        <div className="flex items-center gap-4">
          <Avatar
            seed={user.uid || user.email || user.phoneNumber || "guest"}
            photoUrl={user.photoURL}
            size={64}
          />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Account</h2>
            <p className="text-xs text-gray-500">
              {user.displayName ?? user.email ?? user.phoneNumber ?? "—"}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
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

        {(!linkedPhone || step !== "idle" || e164) && (
          <div className="mt-4 space-y-3">
            {step === "idle" ? (
              <form onSubmit={sendCode} className="space-y-2">
                <PhoneE164Input onChange={onPhoneChange} />
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

      <section className="rounded-2xl border border-red-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-red-900">Delete account</h2>
        <p className="mt-1 text-xs text-gray-600">
          Permanently removes your profile, transcripts, applications, and sign-in.
          You&apos;ll be able to onboard again from scratch with the same phone or email.
          This cannot be undone.
        </p>
        <div className="mt-4 space-y-2">
          <label
            htmlFor="delete-confirm"
            className="block text-xs font-medium text-gray-700"
          >
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tracking-widest"
          />
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleting || deleteConfirm !== "DELETE"}
            className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
          {deleteErr && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteErr}
            </p>
          )}
        </div>
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
