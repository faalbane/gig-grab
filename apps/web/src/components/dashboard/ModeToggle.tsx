"use client";

/**
 * Worker / Hiring mode toggle. Lives at the top of both
 * /dashboard and /dashboard/hiring.
 *
 * Pills hide when the user has no presence on the other side — a
 * pure employer with no candidate row sees only the "Hiring people"
 * pill; a pure worker sees only "Looking for work". Both pills show
 * when both rows exist (or for first-time users with neither, so
 * they can pick a side).
 *
 * Mode is just the URL — switching is a navigation, not state.
 */
import Link from "next/link";

type Props = {
  active: "worker" | "hiring";
  showWorkerPill?: boolean;
  showHiringPill?: boolean;
};

export function ModeToggle({
  active,
  showWorkerPill = true,
  showHiringPill = true,
}: Props) {
  // Nothing to render when only one side is visible AND it's the
  // active one — toggling to itself adds noise. Render only if there
  // are 2 pills OR the single pill is the inactive (so user can swap).
  const visiblePills =
    (showWorkerPill ? 1 : 0) + (showHiringPill ? 1 : 0);
  if (visiblePills < 2) return null;
  return (
    <div
      className="mb-6 inline-flex rounded-xl border p-1"
      style={{
        background: "var(--gg-bg, #fff)",
        borderColor: "var(--gg-line, #e5e7eb)",
      }}
    >
      {showWorkerPill && (
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
      )}
      {showHiringPill && (
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
      )}
    </div>
  );
}
