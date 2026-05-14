"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { ModeToggle } from "@/components/dashboard/ModeToggle";
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

type Applicant = {
  candidateId: string;
  status: string;
  rationale: string | null;
  appliedAt: string;
  score: number | null;
  name: string | null;
  title: string | null;
  yearsExperience: number | null;
  location: string | null;
  summary: string | null;
  ticketsAndCards: string[];
};

type ApplicantsResponse = {
  job: { id: string; title: string };
  applicants: Applicant[];
};

type View = "matches" | "applicants";

export default function EmployerDashboardPage() {
  const user = useAuthUser();
  const [me, setMe] = useState<EmployerMe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, MatchesResponse>>({});
  const [applicants, setApplicants] = useState<Record<string, ApplicantsResponse>>({});
  const [loadingMatches, setLoadingMatches] = useState<string | null>(null);
  const [reranking, setReranking] = useState<string | null>(null);
  const [panelView, setPanelView] = useState<Record<string, View>>({});

  async function refreshJobs() {
    try {
      const data = await fetchWithAuth<EmployerMe>("/api/account/employer/me");
      setMe(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't reload jobs.");
    }
  }

  async function setJobStatus(jobId: string, status: string) {
    try {
      await fetchWithAuth(`/api/account/employer/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      // Optimistic local update so the dropdown reflects immediately.
      setMe((prev) =>
        prev
          ? {
              ...prev,
              jobs: prev.jobs.map((j) =>
                j.id === jobId ? { ...j, status } : j,
              ),
            }
          : prev,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  async function loadApplicants(jobId: string) {
    try {
      const data = await fetchWithAuth<ApplicantsResponse>(
        `/api/account/employer/jobs/${jobId}/applicants`,
      );
      setApplicants((prev) => ({ ...prev, [jobId]: data }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load applicants.");
    }
  }

  async function candidateAction(
    jobId: string,
    candidateId: string,
    action: "shortlist" | "reject" | "request_interview",
  ) {
    try {
      await fetchWithAuth(
        `/api/account/employer/jobs/${jobId}/candidates/${candidateId}/action`,
        { method: "POST", body: JSON.stringify({ action }) },
      );
      await Promise.all([loadApplicants(jobId), refreshJobs()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed.");
    }
  }

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
        <ModeToggle active="hiring" />
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
                href="/voice?audience=employer"
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
                            <select
                              value={j.status}
                              onChange={(e) => setJobStatus(j.id, e.target.value)}
                              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                            >
                              <option value="active">Active</option>
                              <option value="interviewing">Interviewing</option>
                              <option value="paused">Paused</option>
                              <option value="filled">Filled</option>
                            </select>
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => {
                                if (expandedJobId === j.id) {
                                  setExpandedJobId(null);
                                } else {
                                  setExpandedJobId(j.id);
                                  if (!panelView[j.id]) {
                                    setPanelView((p) => ({ ...p, [j.id]: "matches" }));
                                  }
                                  if (!matches[j.id]) openMatches(j.id);
                                }
                              }}
                              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium hover:border-gray-300"
                            >
                              {expandedJobId === j.id ? "Hide" : "Open"}
                            </button>
                          </td>
                        </tr>
                        {expandedJobId === j.id && (
                          <tr key={`${j.id}-panel`}>
                            <td colSpan={6} className="bg-gray-50 px-5 py-4">
                              <JobPanel
                                jobId={j.id}
                                view={panelView[j.id] ?? "matches"}
                                onViewChange={(v) => {
                                  setPanelView((p) => ({ ...p, [j.id]: v }));
                                  if (v === "applicants" && !applicants[j.id]) {
                                    loadApplicants(j.id);
                                  }
                                }}
                                matchesData={matches[j.id]}
                                applicantsData={applicants[j.id]}
                                loadingMatches={loadingMatches === j.id}
                                reranking={reranking === j.id}
                                onRerank={() => openMatches(j.id, true)}
                                onAction={(cid, action) =>
                                  candidateAction(j.id, cid, action)
                                }
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

function JobPanel({
  jobId,
  view,
  onViewChange,
  matchesData,
  applicantsData,
  loadingMatches,
  reranking,
  onRerank,
  onAction,
}: {
  jobId: string;
  view: View;
  onViewChange: (v: View) => void;
  matchesData?: MatchesResponse;
  applicantsData?: ApplicantsResponse;
  loadingMatches: boolean;
  reranking: boolean;
  onRerank: () => void;
  onAction: (
    candidateId: string,
    action: "shortlist" | "reject" | "request_interview",
  ) => void;
}) {
  void jobId;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onViewChange("matches")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              view === "matches"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Top candidates
          </button>
          <button
            type="button"
            onClick={() => onViewChange("applicants")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              view === "applicants"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Applicants
            {applicantsData ? ` (${applicantsData.applicants.length})` : ""}
          </button>
        </div>
        {view === "matches" && matchesData && matchesData.candidates.length > 0 && (
          <button
            type="button"
            onClick={onRerank}
            disabled={reranking}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:border-emerald-300 disabled:opacity-60"
          >
            {reranking
              ? "AI ranking…"
              : matchesData.candidates.some((c) => c.rationale)
                ? "Re-run AI ranking"
                : "Rank with AI (adds rationale)"}
          </button>
        )}
      </div>

      {view === "matches" ? (
        loadingMatches ? (
          <p className="text-sm text-gray-500">Finding matches…</p>
        ) : !matchesData || matchesData.candidates.length === 0 ? (
          <p className="text-sm text-gray-500">
            No semantic matches yet. They&apos;ll appear as candidates complete
            intake calls.
          </p>
        ) : (
          <ul className="space-y-2">
            {matchesData.candidates.map((c, i) => (
              <li
                key={c.candidateId}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <CandidateHead
                  index={i + 1}
                  name={c.name}
                  title={c.title}
                  years={c.yearsExperience}
                  location={c.location}
                  score={c.score}
                  rationale={c.rationale}
                  credentials={c.ticketsAndCards}
                />
                <CandidateActions
                  onAction={(action) => onAction(c.candidateId, action)}
                />
              </li>
            ))}
          </ul>
        )
      ) : !applicantsData ? (
        <p className="text-sm text-gray-500">Loading applicants…</p>
      ) : applicantsData.applicants.length === 0 ? (
        <p className="text-sm text-gray-500">
          No applicants yet. Candidates who tap Apply will appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {applicantsData.applicants.map((a, i) => (
            <li
              key={a.candidateId}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <CandidateHead
                index={i + 1}
                name={a.name}
                title={a.title}
                years={a.yearsExperience}
                location={a.location}
                score={a.score}
                rationale={a.rationale}
                credentials={a.ticketsAndCards}
                badge={a.status}
              />
              <CandidateActions
                onAction={(action) => onAction(a.candidateId, action)}
                currentStatus={a.status}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CandidateHead({
  index,
  name,
  title,
  years,
  location,
  score,
  rationale,
  credentials,
  badge,
}: {
  index: number;
  name: string | null;
  title: string | null;
  years: number | null;
  location: string | null;
  score: number | null;
  rationale: string | null;
  credentials: string[];
  badge?: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            #{index} {name || "—"}{" "}
            <span className="text-xs font-normal text-gray-500">
              · {title || "—"}
              {years ? ` · ${years}y` : ""}
            </span>
            {badge && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                {badge}
              </span>
            )}
          </p>
          {location && <p className="text-xs text-gray-600">{location}</p>}
        </div>
        {score != null && (
          <p className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            {score}% match
          </p>
        )}
      </div>
      {rationale && <p className="mt-2 text-sm text-gray-700">{rationale}</p>}
      {credentials.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Credentials: {credentials.slice(0, 6).join(" · ")}
        </p>
      )}
    </>
  );
}

function CandidateActions({
  onAction,
  currentStatus,
}: {
  onAction: (action: "shortlist" | "reject" | "request_interview") => void;
  currentStatus?: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onAction("shortlist")}
        disabled={currentStatus === "shortlisted"}
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:border-emerald-300 disabled:opacity-50"
      >
        {currentStatus === "shortlisted" ? "Shortlisted ✓" : "Shortlist"}
      </button>
      <button
        type="button"
        onClick={() => onAction("request_interview")}
        disabled={currentStatus === "screened"}
        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:border-blue-300 disabled:opacity-50"
      >
        {currentStatus === "screened" ? "Interview requested ✓" : "Request interview"}
      </button>
      <button
        type="button"
        onClick={() => onAction("reject")}
        disabled={currentStatus === "rejected"}
        className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-gray-300 disabled:opacity-50"
      >
        {currentStatus === "rejected" ? "Rejected" : "Reject"}
      </button>
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
        Describe the role in two minutes — by browser mic or phone — and
        we&apos;ll build the posting as you talk. Matches start flowing
        the moment it&apos;s live.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href="/voice?audience=employer"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          Start hiring (use my mic) →
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

