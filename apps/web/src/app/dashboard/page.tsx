"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/marketing/Header";
import { EditableCvCard } from "@/components/profile/EditableCvCard";
import { ModeToggle } from "@/components/dashboard/ModeToggle";
import { useAuthUser, fetchWithAuth } from "@/lib/firebase";
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

      <div className="mb-4 mt-3 flex flex-wrap items-center gap-2">
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
      className="inline-flex rounded-xl border p-1"
      style={{ background: "var(--gg-bg)", borderColor: "var(--gg-line)" }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="rounded-lg px-3 py-1 text-xs font-semibold transition-all"
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
  return (
    <div
      className="inline-flex rounded-xl border p-1"
      style={{
        background: "var(--gg-bg)",
        borderColor: "var(--gg-line)",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-all"
            style={{
              background: active ? "white" : "transparent",
              color: active ? "var(--gg-ink)" : "var(--gg-muted)",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CountryFilterPills({
  value,
  onChange,
}: {
  value: CountryFilter;
  onChange: (next: CountryFilter) => void;
}) {
  const options: { value: CountryFilter; label: string }[] = [
    { value: "all", label: "All countries" },
    { value: "gb", label: "🇬🇧 United Kingdom" },
    { value: "us", label: "🇺🇸 United States" },
  ];
  return (
    <div
      className="mb-4 inline-flex flex-wrap rounded-xl border p-1"
      style={{
        background: "var(--gg-bg)",
        borderColor: "var(--gg-line)",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-all"
            style={{
              background: active ? "white" : "transparent",
              color: active ? "var(--gg-ink)" : "var(--gg-muted)",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
      onApplied(job.id);
      setShowJustApplied(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't apply right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="rounded-2xl border bg-white p-5"
      style={{
        borderColor: job.applied ? "var(--gg-green-tint)" : "var(--gg-line)",
        background: job.applied ? "var(--gg-green-tint-2)" : "white",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {job.applied ? (
            <span
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white"
              style={{ background: "var(--gg-green-dark)" }}
            >
              <CheckMark /> Applied
            </span>
          ) : (
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white disabled:opacity-60"
              style={{ background: "var(--gg-green)" }}
            >
              {busy ? "Applying…" : "Apply"}
            </button>
          )}
          <a
            href={`tel:${HOTLINE.replace(/\s/g, "")}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold"
            style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
          >
            <IconPhone width={13} height={13} /> Call
          </a>
          <button
            type="button"
            onClick={toggleDetails}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold"
            style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
          >
            {detailsOpen ? "Hide details" : "View details"}
          </button>
          {(() => {
            const safeUrl = safeHttpUrl(job.applyUrl);
            return safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noreferrer nofollow"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold"
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
      {detailsOpen && (
        <div
          className="mt-4 rounded-xl border bg-white p-4"
          style={{ borderColor: "var(--gg-line-2)" }}
        >
          {loadingDetails || !details ? (
            <p className="text-sm" style={{ color: "var(--gg-muted)" }}>
              Loading details…
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              {details.description && (
                <p style={{ color: "var(--gg-ink-2)" }}>{details.description}</p>
              )}
              {details.projectScope && (
                <div>
                  <p
                    className="mono text-[10px] font-semibold uppercase"
                    style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
                  >
                    Scope
                  </p>
                  <p className="mt-1" style={{ color: "var(--gg-ink-2)" }}>
                    {details.projectScope}
                  </p>
                </div>
              )}
              {details.mustHaves.length > 0 && (
                <div>
                  <p
                    className="mono text-[10px] font-semibold uppercase"
                    style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
                  >
                    Must-haves
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {details.mustHaves.map((m, i) => (
                      <span
                        key={i}
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background: "var(--gg-green-tint-2)",
                          color: "var(--gg-green-deep)",
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {details.dealBreakers.length > 0 && (
                <div>
                  <p
                    className="mono text-[10px] font-semibold uppercase"
                    style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
                  >
                    Deal-breakers
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {details.dealBreakers.map((m, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {details.requiredCount > 1 && (
                <p style={{ color: "var(--gg-muted)" }}>
                  {details.requiredCount} workers needed
                </p>
              )}
            </div>
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
