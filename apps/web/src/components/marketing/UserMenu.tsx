"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAuthUser,
  signOutCurrentUser,
  fetchWithAuth,
} from "@/lib/firebase";
import { Avatar } from "@/components/common/Avatar";

type Me = {
  candidate: {
    id: string;
    phone: string | null;
    email: string | null;
    language: string;
  };
  profile: {
    name?: string;
  } | null;
};

export function UserMenu() {
  const user = useAuthUser();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Fetch /account/me when authed for the phone-warning badge
  useEffect(() => {
    if (user === null || user === false) {
      setMe(null);
      return;
    }
    fetchWithAuth<Me>("/api/account/me").then(setMe).catch(() => setMe(null));
  }, [user]);

  if (user === null) {
    return <span className="h-8 w-8 rounded-full bg-gray-100" />;
  }

  if (user === false) {
    return (
      <>
        <a
          href="/auth"
          className="hidden text-sm text-gray-700 hover:text-gray-900 sm:inline-flex"
        >
          ↪ Log in
        </a>
        <a
          href="/start"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Get started
        </a>
      </>
    );
  }

  const phoneMissing = me ? !me.candidate.phone : false;
  const seed = user.uid || user.email || user.phoneNumber || "guest";
  // Prefer the profile_card name (captured on the call) over the auth
  // provider's displayName. Fall back to email / phone / "Signed in".
  const firstName = (me?.profile?.name ?? "").trim().split(/\s+/)[0];
  const headerLabel =
    firstName ||
    user.displayName?.trim().split(/\s+/)[0] ||
    user.email ||
    user.phoneNumber ||
    "Signed in";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative h-9 w-9 overflow-visible rounded-full hover:opacity-90"
        aria-label="Account menu"
      >
        <Avatar seed={seed} photoUrl={user.photoURL} size={36} />
        {phoneMissing && (
          <span
            title="Phone not set up"
            className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white"
          >
            !
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-gray-900">
              {headerLabel}
            </p>
            {user.email && headerLabel !== user.email && (
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            )}
          </div>
          {phoneMissing && (
            <a
              href="/settings"
              className="my-1 block rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 hover:bg-amber-100"
            >
              ⚠️ Add your phone number
            </a>
          )}
          <a
            href="/dashboard"
            className="block rounded-md px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
          >
            Dashboard
          </a>
          <a
            href="/settings"
            className="block rounded-md px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
          >
            Settings
          </a>
          <button
            type="button"
            onClick={async () => {
              await signOutCurrentUser();
              window.location.href = "/";
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
