"use client";

/**
 * Worker / Hiring mode toggle. Lives at the top of both
 * /dashboard and /dashboard/hiring so users with both roles (or
 * neither yet) can swap without hidden routing logic.
 *
 * Mode is just the URL — switching is a navigation, not state. That
 * keeps the source of truth simple: whichever page you're on is
 * whichever mode you're in.
 */
import Link from "next/link";

export function ModeToggle({ active }: { active: "worker" | "hiring" }) {
  return (
    <div
      className="mb-6 inline-flex rounded-xl border p-1"
      style={{
        background: "var(--gg-bg, #fff)",
        borderColor: "var(--gg-line, #e5e7eb)",
      }}
    >
      <Link
        href="/dashboard"
        prefetch={false}
        className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
          active === "worker"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Looking for work
      </Link>
      <Link
        href="/dashboard/hiring"
        prefetch={false}
        className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
          active === "hiring"
            ? "bg-emerald-50 text-emerald-700 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Hiring people
      </Link>
    </div>
  );
}
