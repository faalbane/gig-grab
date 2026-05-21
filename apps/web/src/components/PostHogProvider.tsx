"use client";

/**
 * Comprehensive PostHog wiring for the GigGrab web app.
 *
 * - Boots once on mount with the EU project token + EU ingest host.
 * - Auto-captures pageviews via the SDK's history-API listener.
 * - Identifies the user against PostHog as soon as Firebase auth lands,
 *   using the Firebase UID. Sets person properties (email, phone) so
 *   funnels can segment without joining to Cloud SQL.
 * - Sends $reset on sign-out so the next session is fresh.
 * - Re-exports a small `track(event, props)` helper for ad-hoc events
 *   from anywhere in the app — buttons, form submits, voice events, etc.
 *
 * Token + host live in NEXT_PUBLIC_POSTHOG_KEY and
 * NEXT_PUBLIC_POSTHOG_HOST (apps/web/.env.local + Firebase Hosting
 * predeploy build env). PostHog is loaded ONLY when the key is present
 * so a forgotten env var doesn't break the static build.
 */

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as ReactPostHogProvider } from "posthog-js/react";
import { useAuthUser } from "@/lib/firebase";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let initialised = false;
function ensureInit() {
  if (initialised || typeof window === "undefined" || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
    person_profiles: "identified_only",
    loaded: () => {
      initialised = true;
    },
  });
  initialised = true;
}

export function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    ensureInit();
  }, []);
  if (!POSTHOG_KEY) return <>{children}</>;
  return (
    <ReactPostHogProvider client={posthog}>
      <AuthIdentifier />
      {children}
    </ReactPostHogProvider>
  );
}

function AuthIdentifier() {
  const user = useAuthUser();
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    if (user === null) return; // still loading
    if (user === false) {
      // Anonymous (signed out). Reset so the next sign-in is a fresh
      // person — prevents stitching a logout user with the next visitor.
      try {
        posthog.reset();
      } catch {
        // ignore
      }
      return;
    }
    try {
      posthog.identify(user.uid, {
        email: user.email ?? undefined,
        phone: user.phoneNumber ?? undefined,
        displayName: user.displayName ?? undefined,
      });
    } catch {
      // ignore
    }
  }, [user]);
  return null;
}

/**
 * Ad-hoc event capture. Use anywhere in the app. Falls back to a noop
 * when PostHog isn't initialised (e.g. local dev without a key).
 */
export function track(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!POSTHOG_KEY) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // ignore
  }
}
