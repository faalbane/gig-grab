"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/marketing/Header";
import { EditableCvCard } from "@/components/profile/EditableCvCard";
import { ModeToggle } from "@/components/dashboard/ModeToggle";
import { useAuthUser, fetchWithAuth } from "@/lib/firebase";
import { track } from "@/components/PostHogProvider";
import { IconPhone, IconBolt } from "@/components/marketing/hotline/icons";
import type { ProfileCard } from "@/lib/types";

type Tab = "profile" | "jobs";

type AccountMe = {
  candidate: {
    id: string;
    phone: string | null;
    email: string | null;
    language: string;
  };
  profile: ProfileCard | null;
};

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

// Defence in depth — server validates applyUrl scheme on write/read but
// older rows persisted before the validator may still contain garbage.
// Never inline a string into <a href> without a scheme check.
function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<FullPageLoading />}>
      <DashboardPageInner />
    </Suspense>
  );
}

function DashboardPageInner() {
  const user = useAuthUser();
  const params = useSearchParams();
  const initialTab: Tab = params.get("tab") === "jobs" ? "jobs" : "profile";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [me, setMe] = useState<AccountMe | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) return; // pending
    if (user === false) {
      window.location.href = "/auth";
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithAuth<AccountMe>("/api/account/me");
        if (!cancelled) setMe(data);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load your account.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (user === null) {
    return <FullPageLoading />;
  }
  if (user === false) {
    return null;
  }

  const name = me?.profile?.name?.split(" ")[0] || "there";

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
          <ModeToggle active="worker" />
          <div className="mb-6">
            <p
              className="mono text-xs font-semibold uppercase"
              style={{
                color: "var(--gg-green-dark)",
                letterSpacing: "0.14em",
              }}
            >
              Welcome back
            </p>
            <h1
              className="m-0 mt-1.5 text-3xl font-extrabold tracking-tight sm:text-[34px]"
              style={{ color: "var(--gg-ink)" }}
            >
              Hi {name} — let&apos;s pick up where you left off.
            </h1>
          </div>

          <div
            className="mb-7 inline-flex rounded-xl border p-1"
            style={{
              background: "var(--gg-bg)",
              borderColor: "var(--gg-line)",
            }}
          >
            <TabButton
              active={tab === "profile"}
              onClick={() => setTab("profile")}
              label="My profile"
            />
            <TabButton
              active={tab === "jobs"}
              onClick={() => setTab("jobs")}
              label="Jobs"
            />
          </div>

          {err && (
            <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </p>
          )}

          {tab === "profile" && (
            <ProfileTab
              me={me}
              onProfileUpdated={(next) =>
                setMe((prev) => (prev ? { ...prev, profile: next } : prev))
              }
            />
          )}
          {tab === "jobs" && (
            <JobsTab
              candidateEmail={me?.candidate.email ?? null}
              onBackToProfile={() => setTab("profile")}
              onEmailUpdated={(email) =>
                setMe((prev) =>
                  prev
                    ? { ...prev, candidate: { ...prev.candidate, email } }
                    : prev,
                )
              }
            />
          )}
        </div>
      </main>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-5 py-2 text-sm font-semibold transition-all"
      style={{
        background: active ? "white" : "transparent",
        color: active ? "var(--gg-ink)" : "var(--gg-muted)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
      }}
    >
      {label}
    </button>
  );
}

function ProfileTab({
  me,
  onProfileUpdated,
}: {
  me: AccountMe | null;
  onProfileUpdated: (next: ProfileCard) => void;
}) {
  if (!me) {
    return (
      <div
        className="rounded-2xl border bg-white p-10 text-center text-sm"
        style={{ borderColor: "var(--gg-line)", color: "var(--gg-muted)" }}
      >
        Loading your profile…
      </div>
    );
  }

  // Stub Google/email row with no phone yet — almost certainly the
  // signed-in user has prior hotline calls under a different identity
  // (phone only). Pushing them to /settings to verify their phone
  // triggers accountPhoneConfirm which merges the unclaimed hotline
  // row into this account.
  if (!me.profile && !me.candidate.phone) {
    return (
      <EmptyState
        icon={<IconPhone width={26} height={26} />}
        title="Link your phone to find prior calls"
        body="We sign you in by email today, but our hotline knows you by phone. Verify a phone number and we'll merge any prior hotline calls into this account — your CV will appear here automatically."
        primaryLabel="Verify my phone"
        primaryHref="/settings"
        secondaryLabel="Call me now"
        secondaryHref="/start"
      />
    );
  }

  if (!me.profile) {
    return (
      <EmptyState
        icon={<IconPhone width={26} height={26} />}
        title="Let's build your profile"
        body="We don't have a profile on file yet. Talk to our AI for two minutes — by phone or browser mic — and we'll generate one from the conversation."
        primaryLabel="Call me now"
        primaryHref="/start"
        secondaryLabel="Use my microphone"
        secondaryHref="/voice"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <EditableCvCard
        card={me.profile}
        email={me.candidate.email ?? undefined}
        onUpdated={onProfileUpdated}
      />
    </div>
  );
}

type JobRow = {
  id: string;
  title: string;
  company: string | null;
  location: string;
  pay: string | null;
  shiftPattern: string | null;
  source: string | null;
  country: string | null;
  applyUrl: string | null;
  createdAt: string;
  applied: boolean;
};

type CountryFilter = "all" | "gb" | "us";
type ApplyView = "all" | "applied";
type SourceFilter = "all" | "giggrab";
type RecencyFilter = "any" | "7" | "30";

type JobsResponse = {
  jobs: JobRow[];
  country: string;
  mode: "exact" | "similar" | "personalized" | "recent" | "applied";
  q: string;
  totalCount: number;
  hasMore: boolean;
};

function JobsTab({
  candidateEmail,
  onBackToProfile,
  onEmailUpdated,
}: {
  candidateEmail: string | null;
  onBackToProfile: () => void;
  onEmailUpdated: (email: string) => void;
}) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<ApplyView>("all");
  const [country, setCountry] = useState<CountryFilter>(() => {
    if (typeof window === "undefined") return "all";
    try {
      const raw = localStorage.getItem("gg.locale.country");
      if (!raw) return "all";
      const parsed = JSON.parse(raw) as { country?: string };
      const c = String(parsed?.country ?? "").toUpperCase();
      if (c === "GB" || c === "UK") return "gb";
      if (c === "US") return "us";
      return "all";
    } catch {
      return "all";
    }
  });
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [recency, setRecency] = useState<RecencyFilter>("any");
  // Query input is decoupled from `qDebounced` so we don't spam the
  // backend on every keystroke. 300ms debounce — short enough to feel
  // live, long enough that a typist doesn't fire 10 cosine queries.
  const [qInput, setQInput] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(qInput.trim()), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  const [meta, setMeta] = useState<Pick<JobsResponse, "mode" | "totalCount" | "hasMore" | "q"> | null>(null);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 20;

  // Reset pagination + clear list whenever the filter inputs change so
  // the next fetch is fresh.
  useEffect(() => {
    setOffset(0);
  }, [country, view, sourceFilter, recency, qDebounced]);

  useEffect(() => {
    let cancelled = false;
    setJobs(null);
    setErr(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
    if (country !== "all") params.set("country", country);
    if (view === "applied") params.set("applied", "1");
    if (sourceFilter === "giggrab") params.set("gigOnly", "1");
    if (recency !== "any") params.set("recency", recency);
    if (qDebounced) params.set("q", qDebounced);
    (async () => {
      try {
        const data = await fetchWithAuth<JobsResponse>(
          `/api/account/jobs?${params.toString()}`,
        );
        if (cancelled) return;
        setJobs(data.jobs ?? []);
        setMeta({
          mode: data.mode,
          totalCount: data.totalCount,
          hasMore: data.hasMore,
          q: data.q,
        });
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Couldn't load jobs.");
          setJobs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [country, view, sourceFilter, recency, qDebounced]);

  async function loadMore() {
    if (!jobs || loadingMore || !meta?.hasMore) return;
    setLoadingMore(true);
    const nextOffset = offset + PAGE_SIZE;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    if (country !== "all") params.set("country", country);
    if (view === "applied") params.set("applied", "1");
    if (sourceFilter === "giggrab") params.set("gigOnly", "1");
    if (recency !== "any") params.set("recency", recency);
    if (qDebounced) params.set("q", qDebounced);
    try {
      const data = await fetchWithAuth<JobsResponse>(
        `/api/account/jobs?${params.toString()}`,
      );
      setJobs((prev) => (prev ? [...prev, ...(data.jobs ?? [])] : data.jobs ?? []));
      setOffset(nextOffset);
      setMeta({
        mode: data.mode,
        totalCount: data.totalCount,
        hasMore: data.hasMore,
        q: data.q,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
        style={{
          background: "var(--gg-green-tint-2)",
          borderColor: "var(--gg-line)",
        }}
      >
        <p className="m-0 text-sm" style={{ color: "var(--gg-ink-2)" }}>
          <strong>To apply, call our hotline.</strong> Tell our AI which
          role and we&apos;ll route you straight to the right person.
        </p>
        <a
          href={`tel:${HOTLINE.replace(/\s/g, "")}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white"
          style={{ background: "var(--gg-green)" }}
        >
          <IconPhone width={13} height={13} /> {HOTLINE}
        </a>
      </div>

      <SearchInput value={qInput} onChange={setQInput} />

      <div className="mb-4 mt-3 -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        <CountryFilterPills value={country} onChange={setCountry} />
        <ViewFilterPills value={view} onChange={setView} />
        <SourceFilterPills value={sourceFilter} onChange={setSourceFilter} />
        <RecencyFilterPills value={recency} onChange={setRecency} />
      </div>

      <ModeBanner
        mode={meta?.mode}
        q={meta?.q ?? ""}
        totalCount={meta?.totalCount ?? 0}
        loaded={jobs?.length ?? 0}
      />

      {jobs === null ? (
        <ResultsSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyResults
          q={qDebounced}
          view={view}
          onBackToProfile={onBackToProfile}
          onClearSearch={() => setQInput("")}
          err={err}
        />
      ) : (
        <>
          <div className="space-y-3">
            {jobs.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                highlight={qDebounced}
                candidateEmail={candidateEmail}
                onApplied={(jobId) =>
                  setJobs((prev) =>
                    prev
                      ? prev.map((row) =>
                          row.id === jobId ? { ...row, applied: true } : row,
                        )
                      : prev,
                  )
                }
                onEmailUpdated={onEmailUpdated}
              />
            ))}
          </div>
          {meta?.hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] bg-white px-4 text-xs font-semibold disabled:opacity-60"
                style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
              >
                {loadingMore ? "Loading…" : "Load more →"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by title, company or location…"
        className="w-full rounded-xl border bg-white px-4 py-3 pl-11 text-sm outline-none focus:ring-2"
        style={{ borderColor: "var(--gg-line)" }}
      />
      <svg
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--gg-muted)" }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
          style={{ color: "var(--gg-muted)" }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function ModeBanner({
  mode,
  q,
  totalCount,
  loaded,
}: {
  mode: JobsResponse["mode"] | undefined;
  q: string;
  totalCount: number;
  loaded: number;
}) {
  if (!mode || loaded === 0) return null;
  let label = "";
  let tone: "green" | "blue" | "amber" = "green";
  if (mode === "exact") {
    label = `${totalCount} result${totalCount === 1 ? "" : "s"} for "${q}"`;
    tone = "green";
  } else if (mode === "similar") {
    label = `No exact matches for "${q}" — showing similar roles`;
    tone = "amber";
  } else if (mode === "personalized") {
    label = `${totalCount} role${totalCount === 1 ? "" : "s"} — ranked for your profile`;
    tone = "blue";
  } else if (mode === "applied") {
    label = `${totalCount} application${totalCount === 1 ? "" : "s"}`;
    tone = "green";
  } else {
    label = `${totalCount} recent role${totalCount === 1 ? "" : "s"}`;
    tone = "green";
  }
  const bg =
    tone === "amber"
      ? "#FEF3C7"
      : tone === "blue"
        ? "#DBEAFE"
        : "var(--gg-green-tint-2)";
  const color =
    tone === "amber"
      ? "#92400E"
      : tone === "blue"
        ? "#1E40AF"
        : "var(--gg-green-deep)";
  return (
    <div
      className="mb-3 rounded-lg px-3 py-2 text-xs font-medium"
      style={{ background: bg, color }}
    >
      {label}
    </div>
  );
}

function EmptyResults({
  q,
  view,
  onBackToProfile,
  onClearSearch,
  err,
}: {
  q: string;
  view: ApplyView;
  onBackToProfile: () => void;
  onClearSearch: () => void;
  err: string | null;
}) {
  if (view === "applied") {
    return (
      <div
        className="rounded-2xl border bg-white p-8 text-center text-sm"
        style={{ borderColor: "var(--gg-line)", color: "var(--gg-muted)" }}
      >
        You haven&apos;t applied to any roles yet. Switch back to{" "}
        <strong className="font-bold" style={{ color: "var(--gg-ink)" }}>
          All
        </strong>{" "}
        to browse, then tap{" "}
        <strong className="font-bold">Apply</strong> on a card.
      </div>
    );
  }
  if (q) {
    return (
      <div
        className="rounded-2xl border bg-white p-8 text-center text-sm"
        style={{ borderColor: "var(--gg-line)", color: "var(--gg-muted)" }}
      >
        Nothing matches &ldquo;<strong style={{ color: "var(--gg-ink)" }}>{q}</strong>&rdquo;
        with the current filters.
        <div className="mt-3">
          <button
            type="button"
            onClick={onClearSearch}
            className="inline-flex h-9 items-center rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold"
            style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
          >
            Clear search
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="rounded-3xl border bg-white p-10 text-center sm:p-14"
      style={{
        borderColor: "var(--gg-line)",
        boxShadow:
          "0 30px 80px -50px rgba(14,40,22,0.18), 0 2px 6px rgba(14,40,22,0.04)",
      }}
    >
      <div
        className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full"
        style={{
          background: "var(--gg-green-tint)",
          color: "var(--gg-green-dark)",
        }}
      >
        <IconBolt width={26} height={26} />
      </div>
      <h2
        className="m-0 mb-3 text-2xl font-extrabold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        Jobs are on the way
      </h2>
      <p
        className="mx-auto mb-7 max-w-md text-[15px] leading-relaxed"
        style={{ color: "var(--gg-muted)" }}
      >
        {err ??
          "We're connecting employers right now — live, vetted roles will start surfacing here shortly. Please check back soon."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onBackToProfile}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white"
          style={{ background: "var(--gg-green)" }}
        >
          Update your profile
        </button>
        <a
          href={`tel:${HOTLINE.replace(/\s/g, "")}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] bg-white px-5 text-sm font-semibold"
          style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
        >
          <IconPhone width={16} height={16} /> Hotline {HOTLINE}
        </a>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border bg-white p-5"
          style={{ borderColor: "var(--gg-line)" }}
        >
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-gray-100" />
          <div className="mt-4 h-3 w-1/4 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function SourceFilterPills({
  value,
  onChange,
}: {
  value: SourceFilter;
  onChange: (next: SourceFilter) => void;
}) {
  const options: { value: SourceFilter; label: string }[] = [
    { value: "all", label: "All sources" },
    { value: "giggrab", label: "GigGrab only" },
  ];
  return <PillRow value={value} onChange={onChange} options={options} />;
}

function RecencyFilterPills({
  value,
  onChange,
}: {
  value: RecencyFilter;
  onChange: (next: RecencyFilter) => void;
}) {
  const options: { value: RecencyFilter; label: string }[] = [
    { value: "any", label: "Any time" },
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
  ];
  return <PillRow value={value} onChange={onChange} options={options} />;
}

function PillRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      className="inline-flex flex-shrink-0 whitespace-nowrap rounded-xl border p-0.5"
      style={{ background: "var(--gg-bg)", borderColor: "var(--gg-line)" }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all"
          style={{
            background: o.value === value ? "white" : "transparent",
            color: o.value === value ? "var(--gg-ink)" : "var(--gg-muted)",
            boxShadow: o.value === value ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ViewFilterPills({
  value,
  onChange,
}: {
  value: ApplyView;
  onChange: (next: ApplyView) => void;
}) {
  const options: { value: ApplyView; label: string }[] = [
    { value: "all", label: "All" },
    { value: "applied", label: "✓ Applied" },
  ];
  return <PillRow value={value} onChange={onChange} options={options} />;
}

function CountryFilterPills({
  value,
  onChange,
}: {
  value: CountryFilter;
  onChange: (next: CountryFilter) => void;
}) {
  const options: { value: CountryFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "gb", label: "🇬🇧 UK" },
    { value: "us", label: "🇺🇸 US" },
  ];
  return <PillRow value={value} onChange={onChange} options={options} />;
}

type MatchScore = {
  overall: number;
  experience: number;
  skills: number;
  industry: number;
  rationale: string;
  cached?: boolean;
};

type PublicJob = {
  id: string;
  title: string;
  company: string | null;
  location: string;
  pay: string | null;
  shiftPattern: string | null;
  requiredCount: number;
  mustHaves: string[];
  dealBreakers: string[];
  description: string | null;
  projectScope: string | null;
  whatYoullNeed: string[];
  source: string;
  createdAt: string;
};

function highlightTerm(
  text: string | null | undefined,
  term: string,
): React.ReactNode {
  if (!text) return text ?? "";
  if (!term || term.length < 2) return text;
  // Escape regex metacharacters in the user-typed term.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase() ? (
      <mark
        key={i}
        className="rounded px-0.5"
        style={{ background: "var(--gg-green-tint-2)", color: "var(--gg-green-deep)" }}
      >
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function JobCard({
  job,
  highlight = "",
  candidateEmail,
  onApplied,
  onEmailUpdated,
}: {
  job: JobRow;
  highlight?: string;
  candidateEmail: string | null;
  onApplied: (jobId: string) => void;
  onEmailUpdated: (email: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Show the confirmation strip on a freshly-applied card only — when
  // the page reloads, the green Applied pill alone is enough.
  const [showJustApplied, setShowJustApplied] = useState(false);
  const [details, setDetails] = useState<PublicJob | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [matchScore, setMatchScore] = useState<MatchScore | null>(null);
  const [loadingScore, setLoadingScore] = useState(false);

  async function loadScore() {
    if (loadingScore) return;
    setLoadingScore(true);
    try {
      const data = await fetchWithAuth<MatchScore>(
        `/api/account/jobs/${job.id}/score`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setMatchScore(data);
      track("match_score_viewed", {
        jobId: job.id,
        title: job.title,
        company: job.company ?? null,
        source: job.source ?? null,
        applyUrl: job.applyUrl ?? null,
        overall: data.overall,
        experience: data.experience,
        skills: data.skills,
        industry: data.industry,
        cached: !!data.cached,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't score this match.");
    } finally {
      setLoadingScore(false);
    }
  }

  // jobs.source === 'voice' means the brief was built on a GigGrab
  // employer-intake call. 'link' / 'ats' / 'upload' come from external
  // sources (Adzuna, ATS connectors). Badge the difference so candidates
  // know which ones are first-party.
  const isGigGrabNative = job.source === "voice" || job.source === "upload";

  async function toggleDetails() {
    if (detailsOpen) {
      setDetailsOpen(false);
      return;
    }
    setDetailsOpen(true);
    if (details) return;
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`);
      if (res.ok) {
        const j = (await res.json()) as PublicJob;
        setDetails(j);
      }
    } finally {
      setLoadingDetails(false);
    }
  }

  async function apply() {
    if (job.applied || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fetchWithAuth(`/api/account/jobs/${job.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ via: "web" }),
      });
      track("job_applied", {
        jobId: job.id,
        title: job.title,
        company: job.company ?? null,
        country: job.country ?? null,
        source: job.source ?? null,
        applyUrl: job.applyUrl ?? null,
      });
      onApplied(job.id);
      setShowJustApplied(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't apply right now.";
      // Quota gate: backend returns 402 quota_exceeded → bounce to
      // pricing so the user can upgrade.
      if (msg === "quota_exceeded" || msg.includes("quota_exceeded")) {
        track("apply_blocked_quota", { jobId: job.id });
        window.location.href = "/pricing?billing=quota_exceeded";
        return;
      }
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="overflow-hidden rounded-2xl border bg-white p-4 sm:p-5"
      style={{
        borderColor: job.applied ? "var(--gg-green-tint)" : "var(--gg-line)",
        background: job.applied ? "var(--gg-green-tint-2)" : "white",
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="m-0 text-[17px] font-bold tracking-tight"
              style={{ color: "var(--gg-ink)" }}
            >
              {highlightTerm(job.title, highlight)}
            </h3>
            {isGigGrabNative && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: "var(--gg-green-tint-2)",
                  color: "var(--gg-green-deep)",
                  letterSpacing: "0.08em",
                }}
              >
                GigGrab
              </span>
            )}
          </div>
          <p
            className="mt-0.5 text-sm"
            style={{ color: "var(--gg-ink-2)" }}
          >
            {highlightTerm(
              [job.company, job.location].filter(Boolean).join(" · "),
              highlight,
            )}
          </p>
          <p
            className="mt-1.5 mono text-xs"
            style={{ color: "var(--gg-muted)", letterSpacing: "0.04em" }}
          >
            {[
              job.country === "gb"
                ? "🇬🇧 UK"
                : job.country === "us"
                  ? "🇺🇸 US"
                  : null,
              job.pay,
              job.shiftPattern,
              job.source ? `via ${job.source}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {job.applied ? (
            <span
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white sm:flex-initial"
              style={{ background: "var(--gg-green-dark)" }}
            >
              <CheckMark /> Applied
            </span>
          ) : (
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white disabled:opacity-60 sm:flex-initial"
              style={{ background: "var(--gg-green)" }}
            >
              {busy ? "Applying…" : "Apply"}
            </button>
          )}
          <a
            href={`tel:${HOTLINE.replace(/\s/g, "")}`}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold sm:flex-initial"
            style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
          >
            <IconPhone width={13} height={13} /> Call
          </a>
          <button
            type="button"
            onClick={toggleDetails}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold sm:flex-initial"
            style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
          >
            {detailsOpen ? "Hide details" : "View details"}
          </button>
          {!matchScore && (
            <button
              type="button"
              onClick={loadScore}
              disabled={loadingScore}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border-[1.5px] px-3 text-xs font-semibold disabled:opacity-60 sm:flex-initial"
              style={{
                borderColor: "var(--gg-green-tint)",
                background: "var(--gg-green-tint-2)",
                color: "var(--gg-green-deep)",
              }}
            >
              {loadingScore ? "Scoring…" : "Match score"}
            </button>
          )}
          {(() => {
            const safeUrl = safeHttpUrl(job.applyUrl);
            return safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noreferrer nofollow"
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold sm:flex-initial"
                style={{
                  borderColor: "var(--gg-line-2)",
                  color: "var(--gg-ink)",
                }}
              >
                Listing ↗
              </a>
            ) : null;
          })()}
        </div>
      </div>
      {matchScore && (
        <MatchScoreCard score={matchScore} onRecompute={loadScore} loading={loadingScore} />
      )}
      {detailsOpen && (
        <div
          className="mt-4 overflow-hidden rounded-xl border bg-white p-4"
          style={{ borderColor: "var(--gg-line-2)" }}
        >
          {loadingDetails || !details ? (
            <p className="text-sm" style={{ color: "var(--gg-muted)" }}>
              Loading details…
            </p>
          ) : (
            <JobDetailsTemplate details={details} />
          )}
        </div>
      )}
      {err && (
        <p
          className="mt-2 rounded-md px-3 py-1.5 text-xs"
          style={{
            background: "rgba(230,57,70,0.08)",
            color: "#9B1C29",
          }}
          role="alert"
        >
          {err}
        </p>
      )}
      {showJustApplied && (
        <AppliedConfirmation
          job={job}
          candidateEmail={candidateEmail}
          onEmailUpdated={onEmailUpdated}
          onDismiss={() => setShowJustApplied(false)}
        />
      )}
    </article>
  );
}

function AppliedConfirmation({
  job,
  candidateEmail,
  onEmailUpdated,
  onDismiss,
}: {
  job: JobRow;
  candidateEmail: string | null;
  onEmailUpdated: (email: string) => void;
  onDismiss: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailErr("That email doesn't look right.");
      return;
    }
    setBusy(true);
    setEmailErr(null);
    try {
      await fetchWithAuth(`/api/account/email`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      onEmailUpdated(email);
      setSaved(true);
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : "Couldn't save email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-3 rounded-xl border p-3.5"
      style={{
        background: "var(--gg-green-tint-2)",
        borderColor: "var(--gg-green-tint)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="m-0 text-sm leading-snug"
          style={{ color: "var(--gg-green-deep)" }}
        >
          <strong className="font-bold">Application logged.</strong>{" "}
          We&apos;ll call you when {job.company ?? "the employer"} responds.
          {(() => {
            const safeUrl = safeHttpUrl(job.applyUrl);
            return safeUrl ? (
              <>
                {" "}
                You can also submit directly on{" "}
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="font-bold underline"
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  their listing ↗
                </a>
                .
              </>
            ) : null;
          })()}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] font-bold opacity-70 hover:opacity-100"
          style={{ color: "var(--gg-green-dark)" }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {!candidateEmail && !saved && (
        <form onSubmit={saveEmail} className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailErr) setEmailErr(null);
            }}
            placeholder="your@email.com — for status updates"
            className="h-10 flex-1 min-w-[220px] rounded-lg border-[1.5px] bg-white px-3 text-[13px] outline-none"
            style={{
              borderColor: emailErr ? "#E63946" : "var(--gg-line-2)",
            }}
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg px-3 text-xs font-bold text-white disabled:opacity-60"
            style={{ background: "var(--gg-green-dark)" }}
          >
            {busy ? "Saving…" : "Save email"}
          </button>
        </form>
      )}
      {saved && (
        <p
          className="m-0 mt-2 text-xs"
          style={{ color: "var(--gg-green-dark)" }}
        >
          ✓ Saved — we&apos;ll email you status updates.
        </p>
      )}
      {emailErr && (
        <p
          className="m-0 mt-2 text-xs"
          style={{ color: "#9B1C29" }}
        >
          {emailErr}
        </p>
      )}
    </div>
  );
}

/**
 * Compact match-score card. Renders three pillar rings + overall +
 * rationale. Shows under the JobCard once the candidate hits "Match
 * score". Recompute button costs another LLM call so the label says so.
 */
function MatchScoreCard({
  score,
  onRecompute,
  loading,
}: {
  score: MatchScore;
  onRecompute: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="mt-4 overflow-hidden rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--gg-green-tint)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <ScoreRing label="Overall" value={score.overall} size={56} tone="hero" />
          <div>
            <p
              className="mono text-[10px] font-semibold uppercase"
              style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
            >
              Match score
            </p>
            <p
              className="m-0 text-sm leading-snug"
              style={{ color: "var(--gg-ink-2)" }}
            >
              {score.rationale}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRecompute}
          disabled={loading}
          className="text-[11px] font-semibold underline disabled:opacity-60"
          style={{ color: "var(--gg-muted)" }}
        >
          {loading ? "Recomputing…" : "Re-score"}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <ScoreRing label="Experience" value={score.experience} />
        <ScoreRing label="Skills" value={score.skills} />
        <ScoreRing label="Industry" value={score.industry} />
      </div>
    </div>
  );
}

function ScoreRing({
  label,
  value,
  size = 44,
  tone = "pillar",
}: {
  label: string;
  value: number;
  size?: number;
  tone?: "pillar" | "hero";
}) {
  const stroke = size <= 50 ? 4 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const dash = (c * v) / 100;
  const color =
    v >= 70
      ? "var(--gg-green-dark)"
      : v >= 40
        ? "#D97706"
        : "#9CA3AF";
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#E5E7EB"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span
          className="absolute inset-0 grid place-items-center font-bold"
          style={{
            color: tone === "hero" ? "var(--gg-ink)" : "var(--gg-ink-2)",
            fontSize: size <= 50 ? 11 : 14,
          }}
        >
          {v}%
        </span>
      </div>
      {tone === "pillar" && (
        <p
          className="mt-1 text-[10px] font-semibold uppercase"
          style={{ color: "var(--gg-muted)", letterSpacing: "0.1em" }}
        >
          {label}
        </p>
      )}
    </div>
  );
}

/**
 * Unified job-details template. Used by every JobCard regardless of
 * source. Renders the same hierarchy whether the brief was extracted
 * from a GigGrab voice call (scope + must-haves + count) or scraped
 * from an Adzuna feed (description paragraph). Long descriptions get a
 * read-more toggle so they don't push the card off the viewport.
 */
function JobDetailsTemplate({ details }: { details: PublicJob }) {
  const [expanded, setExpanded] = useState(false);
  const description = (details.description ?? "").trim();
  const PREVIEW_LEN = 320;
  const long = description.length > PREVIEW_LEN;
  const shown = !long || expanded ? description : description.slice(0, PREVIEW_LEN).trimEnd() + "…";

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Workers needed" value={String(details.requiredCount)} />
        <DetailRow
          label="Posted"
          value={new Date(details.createdAt).toLocaleDateString()}
        />
      </div>

      {description && (
        <Section label="About this role">
          <p
            className="whitespace-pre-wrap leading-relaxed [word-break:break-word]"
            style={{ color: "var(--gg-ink-2)" }}
          >
            {shown}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 text-[11px] font-semibold underline"
              style={{ color: "var(--gg-green-dark)" }}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </Section>
      )}

      {details.projectScope && (
        <Section label="Scope">
          <p
            className="whitespace-pre-wrap leading-relaxed [word-break:break-word]"
            style={{ color: "var(--gg-ink-2)" }}
          >
            {details.projectScope}
          </p>
        </Section>
      )}

      {details.whatYoullNeed.length > 0 && (
        <Section label="What you'll need">
          <ul className="list-disc space-y-0.5 pl-5" style={{ color: "var(--gg-ink-2)" }}>
            {details.whatYoullNeed.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      {details.mustHaves.length > 0 && (
        <Section label="Must-haves">
          <div className="flex flex-wrap gap-1.5">
            {details.mustHaves.map((m, i) => (
              <span
                key={i}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  background: "var(--gg-green-tint-2)",
                  color: "var(--gg-green-deep)",
                }}
              >
                {m}
              </span>
            ))}
          </div>
        </Section>
      )}

      {details.dealBreakers.length > 0 && (
        <Section label="Deal-breakers">
          <div className="flex flex-wrap gap-1.5">
            {details.dealBreakers.map((m, i) => (
              <span
                key={i}
                className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
              >
                {m}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="mono text-[10px] font-semibold uppercase"
        style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
      >
        {label}
      </p>
      <p className="mt-0.5" style={{ color: "var(--gg-ink-2)" }}>
        {value}
      </p>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="mono text-[10px] font-semibold uppercase"
        style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
      >
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 12l5 5L20 7"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function EmptyState({
  icon,
  title,
  body,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}) {
  return (
    <div
      className="rounded-3xl border bg-white p-10 text-center sm:p-14"
      style={{
        borderColor: "var(--gg-line)",
        boxShadow:
          "0 30px 80px -50px rgba(14,40,22,0.18), 0 2px 6px rgba(14,40,22,0.04)",
      }}
    >
      <div
        className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full"
        style={{
          background: "var(--gg-green-tint)",
          color: "var(--gg-green-dark)",
        }}
      >
        {icon}
      </div>
      <h2
        className="m-0 mb-3 text-2xl font-extrabold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {title}
      </h2>
      <p
        className="mx-auto mb-7 max-w-md text-[15px] leading-relaxed"
        style={{ color: "var(--gg-muted)" }}
      >
        {body}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={primaryHref}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white"
          style={{ background: "var(--gg-green)" }}
        >
          {primaryLabel}
        </Link>
        <Link
          href={secondaryHref}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] bg-white px-5 text-sm font-semibold"
          style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
        >
          {secondaryLabel}
        </Link>
      </div>
    </div>
  );
}

function FullPageLoading() {
  return (
    <>
      <Header />
      <main
        className="flex-1"
        style={{ background: "var(--gg-bg)", color: "var(--gg-muted)" }}
      >
        <div className="grid min-h-[50vh] place-items-center text-sm">
          Loading…
        </div>
      </main>
    </>
  );
}
