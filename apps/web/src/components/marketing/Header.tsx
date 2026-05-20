"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";
import { useAuthUser, signOutCurrentUser } from "@/lib/firebase";

const NAV_LINKS: [string, string][] = [
  ["For workers", "/"],
  ["For employers", "/hiring"],
  ["Pricing", "/pricing"],
  ["About", "/about"],
];

type HeaderProps = {
  /** Compact mode hides the right-side UserMenu + auth chrome — useful on
   * focused-task pages like /voice where the avatar / "log out" controls
   * clutter the page during a live call. Nav links + mobile hamburger
   * stay so users can still navigate. */
  compact?: boolean;
};

export function Header({ compact = false }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAuthUser();
  const isSignedIn = user !== null && user !== false;

  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Logo />
        <nav className="hidden gap-7 text-sm text-gray-700 sm:flex">
          {NAV_LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-gray-900">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {!compact && <UserMenu />}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-50 sm:hidden"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M6 6l12 12M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="border-t border-gray-100 bg-white px-6 py-3 sm:hidden">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map(([label, href]) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {label}
                </Link>
              </li>
            ))}
            {isSignedIn ? (
              <>
                <li>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-md px-2 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    href="/settings"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Settings
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={async () => {
                      setMobileOpen(false);
                      await signOutCurrentUser();
                      window.location.href = "/";
                    }}
                    className="block w-full rounded-md px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Sign out
                  </button>
                </li>
              </>
            ) : (
              <li>
                <Link
                  href="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-2 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Log in
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
