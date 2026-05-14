"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { useAuthUser, fetchWithAuth } from "@/lib/firebase";

type EmployerJob = {
  id: string;
  title: string;
  location: string;
  pay: string | null;
  shiftPattern: string | null;
  status: "active" | "paused" | "filled" | "draft" | string;
  requiredCount: number;
  createdAt: string;
  mustHaves: string[] | null;
  matchCount: number;
};

type EmployerMe = {
  employer: { id: string; email: string; company: string } | null;
  jobs: EmployerJob[];
};

type MatchCandidate = {
  candidateId: string;
  score: number;
  name: string | null;
  title: string | null;
  yearsExperience: number | null;
  location: string | null;
  summary: string | null;
  ticketsAndCards: string[];
  status: string | null;
  rationale: string | null;
};

type MatchesResponse = {
  job: { id: string; title: string; location: string; pay: string | null };
  candidates: MatchCandidate[];
};

export default function EmployerDashboardPage() {
  const user = useAuthUser();
  const [me, setMe] = useState<EmployerMe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, MatchesResponse>>({});
  const [loadingMatches, setLoadingMatches] = useState<string | null>(null);
  const [reranking, setReranking] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) return;
    if (user === false) {
      window.location.href = "/auth";
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithAuth<EmployerMe>(
          "/api/account/employer/me",
        );
        if (!cancelled) setMe(data);
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Couldn't load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function openMatches(jobId: string, rerank = false) {
    if (expandedJobId === jobId && !rerank) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    if (matches[jobId] && !rerank) return;
    if (rerank) setReranking(jobId);
    else setLoadingMatches(jobId);
    try {
      const path = rerank
        ? `/api/account/employer/jobs/${jobId}/matches?rerank=1`
        : `/api/account/employer/jobs/${jobId}/matches`;
      const data = await fetchWithAuth<MatchesResponse>(path);
      setMatches((prev) => ({ ...prev, [jobId]: data }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load matches.");
    } finally {
      setLoadingMatches(null);
      setReranking(null);
    }
  }

  if (user === null) {
    return (
      <p className="p-8 text-sm text-gray-500">Loading…</p>
    );
  }
  if (user === false) return null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-10">
        {err && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </p>
        )}

        {!me ? (
          <p className="text-sm text-gray-500">Loading your jobs…</p>
        ) : !me.employer ? (
          <EmptyEmployerState />
        ) : (
          <>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Hiring at {me.employer.company}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                  Your jobs
                </h1>
              </div>
              <Link
                href="/hiring"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:border-emerald-300"
              >
                + Post another role
              </Link>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Active jobs"
                value={String(me.jobs.filter((j) => j.status === "active").length)}
              />
              <Stat
                label="Total matches"
                value={String(me.jobs.reduce((n, j) => n + j.matchCount, 0))}
              />
              <Stat label="Jobs posted" value={String(me.jobs.length)} />
              <Stat label="Avg req. count" value={
                me.jobs.length
                  ? String(
                      Math.round(
                        me.jobs.reduce((n, j) => n + j.requiredCount, 0) /
                          me.jobs.length,
                      ),
                    )
                  : "0"
              } />
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {me.jobs.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-500">
                  No jobs yet. Call our hotline or use{" "}
                  <Link href="/hiring" className="text-emerald-700 underline">
                    /hiring
                  </Link>{" "}
                  to post your first role.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-medium text-gray-600">
                    <tr>
                      <th className="px-5 py-3 text-left">Job</th>
                      <th className="px-5 py-3 text-left">Location · Pay</th>
                      <th className="px-5 py-3 text-left">Needed</th>
                      <th className="px-5 py-3 text-left">Matches</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {me.jobs.map((j) => (
                      <>
                        <tr key={j.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4 font-medium text-gray-900">
                            {j.title}
                          </td>
                          <td className="px-5 py-4 text-gray-700">
                            {j.location}
                            {j.pay && ` · ${j.pay}`}
                          </td>
                          <td className="px-5 py-4 text-gray-700">
                            {j.requiredCount}
                          </td>
                          <td className="px-5 py-4 text-emerald-700">
                            {j.matchCount}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={j.status} />
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => openMatches(j.id)}
                              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium hover:border-gray-300"
                            >
                              {expandedJobId === j.id ? "Hide" : "View matches"}
                            </button>
                          </td>
                        </tr>
                        {expandedJobId === j.id && (
                          <tr key={`${j.id}-matches`}>
                            <td colSpan={6} className="bg-gray-50 px-5 py-4">
                              <MatchesPanel
                                loading={loadingMatches === j.id}
                                reranking={reranking === j.id}
                                data={matches[j.id]}
                                onRerank={() => openMatches(j.id, true)}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function MatchesPanel({
  loading,
  reranking,
  data,
  onRerank,
}: {
  loading: boolean;
  reranking: boolean;
  data?: MatchesResponse;
  onRerank: () => void;
}) {
  if (loading) {
    return <p className="text-sm text-gray-500">Finding matches…</p>;
  }
  if (!data) return null;
  if (data.candidates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No candidate matches yet. As more people complete intake calls,
        matches will appear here automatically.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">
          Top {data.candidates.length} candidates by semantic match.
        </p>
        <button
          type="button"
          onClick={onRerank}
          disabled={reranking}
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:border-emerald-300 disabled:opacity-60"
        >
          {reranking
            ? "AI ranking…"
            : data.candidates.some((c) => c.rationale)
              ? "Re-run AI ranking"
              : "Rank with AI (adds rationale)"}
        </button>
      </div>
      <ul className="space-y-2">
        {data.candidates.map((c, i) => (
          <li
            key={c.candidateId}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  #{i + 1} {c.name || "—"}{" "}
                  <span className="text-xs font-normal text-gray-500">
                    · {c.title || "—"}{" "}
                    {c.yearsExperience ? `· ${c.yearsExperience}y` : ""}
                  </span>
                </p>
                {c.location && (
                  <p className="text-xs text-gray-600">{c.location}</p>
                )}
              </div>
              <p className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {c.score}% match
              </p>
            </div>
            {c.rationale && (
              <p className="mt-2 text-sm text-gray-700">{c.rationale}</p>
            )}
            {c.ticketsAndCards.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                Credentials: {c.ticketsAndCards.slice(0, 6).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyEmployerState() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
      <h2 className="text-lg font-semibold text-gray-900">
        Looks like you haven&apos;t posted a job yet.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
        Call our hotline and tell our AI recruiter who you need.
        We&apos;ll build the brief from your conversation and start
        matching candidates as they come in.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link
          href="/hiring"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          Start hiring →
        </Link>
        <Link
          href={`tel:${(process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910").replace(/\s/g, "")}`}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          Call the hotline
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "interviewing"
        ? "bg-blue-50 text-blue-700"
        : status === "filled"
          ? "bg-gray-100 text-gray-700"
          : "bg-amber-50 text-amber-700";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  );
}
