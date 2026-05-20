"use client";

/**
 * Tiny client-side widget that mounts on the marketing homepage and,
 * if a Firebase session is already present, redirects the user to
 * /dashboard. Saves a logged-in visitor from staring at the marketing
 * page when they expected to land in the app.
 *
 * Returns null — no DOM impact. Safe to mount once on /page.tsx.
 */
import { useEffect } from "react";
import { useAuthUser } from "@/lib/firebase";

export function SignedInRedirect() {
  const user = useAuthUser();
  useEffect(() => {
    if (user && user !== null) {
      window.location.replace("/dashboard");
    }
  }, [user]);
  return null;
}
