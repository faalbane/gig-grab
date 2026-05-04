"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/marketing/Header";
import { MatchCard } from "@/components/dashboard/MatchCard";
import { AutoApplyCard } from "@/components/dashboard/AutoApplyCard";
import { ProfileStatsCard } from "@/components/dashboard/ProfileStatsCard";
import type { Match } from "@/lib/types";

const SAMPLE_MATCHES: Match[] = [
  {
    id: "sample-1",
    jobTitle: "Senior Product Designer",
    employer: "Northwind Labs",
    detail: "Remote · Full-time · Start ASAP",
    pay: "£75k",
    matchPct: 98,
    whyRanked: "9 yrs B2B SaaS · Figma + prototyping · remote-ready",
  },
  {
    id: "sample-2",
    jobTitle: "Registered Nurse — A&E",
    employer: "Mercy NHS Trust",
    detail: "Leeds · Permanent",
    pay: "£36k",
    matchPct: 95,
    whyRanked: "NMC PIN · 6 yrs A&E · willing to do nights",
  },
  {
    id: "sample-3",
    jobTitle: "Site Carpenter (1st/2nd fix)",
    employer: "Bayford Build",
    detail: "Manchester · 12-week fit-out",
    pay: "£220/day",
    matchPct: 92,
    whyRanked: "12 yrs · CSCS Gold · led teams of 6 · available in 1 week",
  },
  {
    id: "sample-4",
    jobTitle: "Customer Success Manager",
    employer: "Loop AI",
    detail: "London / Hybrid · Permanent",
    pay: "£45k",
    matchPct: 89,
    whyRanked: "B2B SaaS · enterprise CS · 4 yrs",
  },
];

const FILTER_CHIPS = [
  "Any role",
  "Remote or UK",
  "Start in 2 weeks",
  "Full-time",
];

function DashboardInner() {
  const params = useSearchParams();
  const candidateId = params.get("candidate") ?? params.get("candidateId");
  const [matches, setMatches] = useState<Match[]>(SAMPLE_MATCHES);
  const [name, setName] = useState<string>("there");
  const [stats, setStats] = useState<{
    profileStrength: number;
    newMatchesToday: number;
    recruitersViewed: number;
  }>({ profileStrength: 92, newMatchesToday: 14, recruitersViewed: 8 });

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/candidates/${candidateId}/dashboard`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.matches?.length) setMatches(data.matches);
        if (data.candidate?.name) setName(data.candidate.name);
        if (data.stats) setStats(data.stats);
      } catch {
        // keep sample data
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-sm text-gray-500">Welcome back</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
              Top matches for you · <span className="text-gray-700">{name}</span>
            </h1>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search jobs by role, location, employer…"
            className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex flex-wrap gap-2">
            {FILTER_CHIPS.map((c, i) => (
              <button
                key={c}
                className={`rounded-full border px-3 py-1 text-xs ${
                  i === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
          <div className="space-y-4">
            <AutoApplyCard />
            <ProfileStatsCard
              profileStrength={stats.profileStrength}
              newMatchesToday={stats.newMatchesToday}
              recruitersViewed={stats.recruitersViewed}
            />
          </div>
        </div>
      </main>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-20 text-center text-gray-400">Loading…</div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
