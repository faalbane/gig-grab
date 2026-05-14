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
  appliedCount: number;
  interviewingCount: number;
  shortlistedCount: number;
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

type View = "matches" | "applicants" | "edit";

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

  async function updateJobFields(
    jobId: string,
    patch: {
      title?: string;
      location?: string;
      pay?: string;
      requiredCount?: number;
    },
  ) {
    try {
      await fetchWithAuth(`/api/account/employer/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMe((prev) =>
        prev
          ? {
              ...prev,
              jobs: prev.jobs.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      title: patch.title ?? j.title,
                      location: patch.location ?? j.location,
                      pay: patch.pay !== undefined ? patch.pay || null : j.pay,
                      requiredCount: patch.requiredCount ?? j.requiredCount,
                    }
                  : j,
              ),
            }
          : prev,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't update job.");
      throw e;
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
      <main
        className="flex-1"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--gg-green-tint-2) 0%, transparent 45%), var(--gg-bg)",
        }}
      >
        <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
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
              <div className="mb-6">
                <p
                  className="mono text-xs font-semibold uppercase"
                  style={{
                    color: "var(--gg-green-dark)",
                    letterSpacing: "0.14em",
                  }}
                >
                  Hiring at {me.employer.company}
                </p>
                <h1
                  className="m-0 mt-1.5 text-3xl font-extrabold tracking-tight sm:text-[34px]"
                  style={{ color: "var(--gg-ink)" }}
                >
                  Your hiring pipeline
                </h1>
              </div>

              <PostRoleCard hasJobs={me.jobs.length > 0} />

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Active jobs"
                  value={String(
                    me.jobs.filter((j) => j.status === "active").length,
                  )}
                />
                <Stat
                  label="Applicants"
                  value={String(
                    me.jobs.reduce((n, j) => n + j.appliedCount, 0),
                  )}
                />
                <Stat
                  label="Interviewing"
                  value={String(
                    me.jobs.reduce((n, j) => n + j.interviewingCount, 0),
                  )}
                />
                <Stat
                  label="Shortlisted"
                  value={String(
                    me.jobs.reduce((n, j) => n + j.shortlistedCount, 0),
                  )}
                />
              </div>

              {me.jobs.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-gray-500" style={{ borderColor: "var(--gg-line-2)" }}>
                  No jobs yet. Use the button above to post your first role.
                </p>
              ) : (
                <ul className="mt-6 space-y-4">
                  {me.jobs.map((j) => (
                    <li key={j.id}>
                      <JobTile
                        job={j}
                        expanded={expandedJobId === j.id}
                        onToggle={() => {
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
                        onStatusChange={(v) => setJobStatus(j.id, v)}
                      />
                      {expandedJobId === j.id && (
                        <div
                          className="mt-2 rounded-2xl border bg-white p-5"
                          style={{ borderColor: "var(--gg-line)" }}
                        >
                          <JobPanel
                            jobId={j.id}
                            job={j}
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
                            onSaveEdits={(patch) =>
                              updateJobFields(j.id, patch)
                            }
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function PostRoleCard({ hasJobs }: { hasJobs: boolean }) {
  return (
    <div
      className="rounded-2xl border bg-white p-5"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className="m-0 text-[16px] font-bold tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            {hasJobs ? "Post another role" : "Post your first role"}
          </p>
          <p
            className="mt-0.5 text-sm"
            style={{ color: "var(--gg-muted)" }}
          >
            Describe the role in ~2 minutes. Sarah builds the posting as you talk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/voice?audience=employer"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-bold text-white"
            style={{ background: "var(--gg-green)" }}
          >
            Start hiring (use my mic) →
          </Link>
          <a
            href={`tel:${(process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910").replace(/\s/g, "")}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] bg-white px-4 text-sm font-semibold"
            style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
          >
            Call the hotline
          </a>
        </div>
      </div>
    </div>
  );
}

function JobTile({
  job,
  expanded,
  onToggle,
  onStatusChange,
}: {
  job: EmployerJob;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (v: string) => void;
}) {
  const statusBg =
    job.status === "active"
      ? "var(--gg-green-tint-2)"
      : job.status === "interviewing"
        ? "#DBEAFE"
        : job.status === "filled"
          ? "#F3F4F6"
          : "#FEF3C7";
  const statusColor =
    job.status === "active"
      ? "var(--gg-green-deep)"
      : job.status === "interviewing"
        ? "#1E40AF"
        : job.status === "filled"
          ? "#374151"
          : "#92400E";
  return (
    <article
      className="rounded-2xl border bg-white p-5 transition-shadow hover:shadow-sm"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="m-0 text-[17px] font-bold tracking-tight"
              style={{ color: "var(--gg-ink)" }}
            >
              {job.title}
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: statusBg, color: statusColor, letterSpacing: "0.08em" }}
            >
              {job.status}
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--gg-ink-2)" }}>
            {[job.location, job.pay].filter(Boolean).join(" · ")}
          </p>
          <p
            className="mt-1 mono text-xs"
            style={{ color: "var(--gg-muted)", letterSpacing: "0.04em" }}
          >
            {job.requiredCount} needed · posted {new Date(job.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <select
            value={job.status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="rounded-md border bg-white px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--gg-line-2)" }}
          >
            <option value="active">Active</option>
            <option value="interviewing">Interviewing</option>
            <option value="paused">Paused</option>
            <option value="filled">Filled</option>
          </select>
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-10 items-center rounded-lg px-4 text-xs font-bold text-white"
            style={{ background: "var(--gg-ink)" }}
          >
            {expanded ? "Hide" : "Open"}
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <TileStat label="Applicants" value={job.appliedCount} tone="green" />
        <TileStat label="Interviewing" value={job.interviewingCount} tone="blue" />
        <TileStat label="Shortlisted" value={job.shortlistedCount} tone="emerald" />
      </dl>
    </article>
  );
}

function TileStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "emerald";
}) {
  const bg =
    tone === "green"
      ? "var(--gg-green-tint-2)"
      : tone === "blue"
        ? "#EFF6FF"
        : "#ECFDF5";
  const color =
    tone === "green"
      ? "var(--gg-green-deep)"
      : tone === "blue"
        ? "#1E40AF"
        : "var(--gg-green-dark)";
  return (
    <div className="rounded-xl p-3" style={{ background: bg }}>
      <dt
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {label}
      </dt>
      <dd className="mt-0.5 text-xl font-extrabold" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}

function JobPanel({
  jobId,
  job,
  view,
  onViewChange,
  matchesData,
  applicantsData,
  loadingMatches,
  reranking,
  onRerank,
  onAction,
  onSaveEdits,
}: {
  jobId: string;
  job: EmployerJob;
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
  onSaveEdits: (patch: {
    title?: string;
    location?: string;
    pay?: string;
    requiredCount?: number;
  }) => Promise<void>;
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
          <button
            type="button"
            onClick={() => onViewChange("edit")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              view === "edit"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Edit
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

      {view === "edit" ? (
        <EditJobForm job={job} onSave={onSaveEdits} />
      ) : view === "matches" ? (
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

function EditJobForm({
  job,
  onSave,
}: {
  job: EmployerJob;
  onSave: (patch: {
    title?: string;
    location?: string;
    pay?: string;
    requiredCount?: number;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(job.title);
  const [location, setLocation] = useState(job.location);
  const [pay, setPay] = useState(job.pay ?? "");
  const [requiredCount, setRequiredCount] = useState<number>(job.requiredCount);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    title !== job.title ||
    location !== job.location ||
    (pay || "") !== (job.pay ?? "") ||
    requiredCount !== job.requiredCount;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const patch: {
        title?: string;
        location?: string;
        pay?: string;
        requiredCount?: number;
      } = {};
      if (title !== job.title) patch.title = title.trim();
      if (location !== job.location) patch.location = location.trim();
      if ((pay || "") !== (job.pay ?? "")) patch.pay = pay.trim();
      if (requiredCount !== job.requiredCount)
        patch.requiredCount = requiredCount;
      await onSave(patch);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setTitle(job.title);
    setLocation(job.location);
    setPay(job.pay ?? "");
    setRequiredCount(job.requiredCount);
    setSaved(false);
    setErr(null);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={240}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={240}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Pay (free text)" hint="e.g. $80k–$95k, £250/day, $25/hour">
          <input
            type="text"
            value={pay}
            onChange={(e) => setPay(e.target.value)}
            maxLength={120}
            placeholder="—"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Workers needed">
          <input
            type="number"
            min={1}
            value={requiredCount}
            onChange={(e) =>
              setRequiredCount(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>
      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty && !saving && (
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            Cancel
          </button>
        )}
        {saved && !dirty && (
          <span className="text-xs text-emerald-700">Saved ✓</span>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
        Status (active / paused / interviewing / filled) is edited from the
        dropdown in the row above. Must-haves and deal-breakers are still
        re-extracted from your call transcript — to change them, post the
        role again or contact us.
      </p>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-gray-500">{hint}</span>}
    </label>
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

