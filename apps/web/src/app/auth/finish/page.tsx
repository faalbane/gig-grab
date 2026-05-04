"use client";

import { useEffect, useState, Suspense } from "react";
import { finishEmailMagicLink, postAuthLink } from "@/lib/firebase";

function FinishInner() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cred = await finishEmailMagicLink();
        if (!cred) {
          setError("This link is invalid or has expired.");
          return;
        }
        const token = await cred.user.getIdToken();
        await postAuthLink(token);
        window.location.href = "/dashboard";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    })();
  }, []);

  return (
    <main className="grid min-h-[60vh] place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <p className="text-sm text-red-700">{error}</p>
            <a
              href="/auth"
              className="mt-4 inline-block text-sm text-emerald-700 hover:text-emerald-800"
            >
              ← Back to sign-in
            </a>
          </>
        ) : (
          <p className="text-sm text-gray-600">Signing you in…</p>
        )}
      </div>
    </main>
  );
}

export default function FinishPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-[60vh] place-items-center px-6">
          <p className="text-sm text-gray-600">Signing you in…</p>
        </main>
      }
    >
      <FinishInner />
    </Suspense>
  );
}
