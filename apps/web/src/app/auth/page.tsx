"use client";

// Auth-state guard: signed-in users who land here (typed URL, stale
// link, stale Header "Log in" tap on mobile) get bounced to their
// dashboard. Previously this page rendered AuthCard unconditionally
// even while the UserMenu in the Header showed a signed-in dropdown
// — that caused a confused re-auth attempt that Firebase rejected
// with "That code didn't match" because the user was already signed
// in with the same phone. RCA + fix 2026-05-27.

import { useEffect } from "react";
import { Header } from "@/components/marketing/Header";
import { AuthCard } from "@/components/auth/AuthCard";
import { useAuthUser } from "@/lib/firebase";

export default function AuthPage() {
  const user = useAuthUser();
  const isSignedIn = user !== null && user !== false;

  useEffect(() => {
    if (!isSignedIn) return;
    // Use replace so the back-button doesn't loop the user back into
    // /auth. /dashboard handles the worker-vs-employer routing itself
    // (employer-only users auto-redirect to /dashboard/hiring).
    const u = new URL(window.location.href);
    const returnTo = u.searchParams.get("returnTo") || "/dashboard";
    window.location.replace(returnTo);
  }, [isSignedIn]);

  return (
    <>
      <Header />
      <main
        className="flex-1"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--gg-green-tint-2) 0%, transparent 55%), var(--gg-bg)",
        }}
      >
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(135deg, transparent 0 60px, rgba(14,159,74,0.025) 60px 61px)",
            }}
          />
          <div className="relative mx-auto grid place-items-center px-6 py-12 sm:py-16">
            {isSignedIn ? (
              <p
                className="m-0 text-sm"
                style={{ color: "var(--gg-muted)" }}
              >
                You&rsquo;re already signed in — taking you to your dashboard…
              </p>
            ) : (
              <div>
                <AuthCard />
                <p
                  className="mx-auto mt-6 max-w-sm text-center text-xs leading-snug"
                  style={{ color: "var(--gg-muted)" }}
                >
                  By logging in you agree to our{" "}
                  <a
                    href="/legal/terms"
                    className="underline decoration-[var(--gg-line-2)] underline-offset-2"
                    style={{ color: "var(--gg-ink-2)" }}
                  >
                    Terms
                  </a>{" "}
                  and{" "}
                  <a
                    href="/legal/privacy"
                    className="underline decoration-[var(--gg-line-2)] underline-offset-2"
                    style={{ color: "var(--gg-ink-2)" }}
                  >
                    Privacy Policy
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
