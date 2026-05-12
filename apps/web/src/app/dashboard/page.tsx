"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { EditableCvCard } from "@/components/profile/EditableCvCard";
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

export default function DashboardPage() {
  const user = useAuthUser();
  const [tab, setTab] = useState<Tab>("profile");
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
          {tab === "jobs" && <JobsTab onBackToProfile={() => setTab("profile")} />}
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
};

type CountryFilter = "all" | "gb" | "us";

function JobsTab({ onBackToProfile }: { onBackToProfile: () => void }) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [country, setCountry] = useState<CountryFilter>("all");

  useEffect(() => {
    let cancelled = false;
    setJobs(null); // show loading shimmer between filter switches
    const qs = country === "all" ? "" : `&country=${country}`;
    (async () => {
      try {
        const data = await fetchWithAuth<{ jobs: JobRow[] }>(
          `/api/account/jobs?limit=20${qs}`,
        );
        if (!cancelled) setJobs(data.jobs ?? []);
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
  }, [country]);

  if (jobs === null) {
    return (
      <div
        className="rounded-2xl border bg-white p-10 text-center text-sm"
        style={{ borderColor: "var(--gg-line)", color: "var(--gg-muted)" }}
      >
        Loading jobs…
      </div>
    );
  }

  if (jobs.length === 0) {
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

  return (
    <div>
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
        style={{
          background: "var(--gg-green-tint-2)",
          borderColor: "var(--gg-line)",
        }}
      >
        <p
          className="m-0 text-sm"
          style={{ color: "var(--gg-ink-2)" }}
        >
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
      <CountryFilterPills value={country} onChange={setCountry} />
      <div className="space-y-3">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>
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

function JobCard({ job }: { job: JobRow }) {
  return (
    <article
      className="rounded-2xl border bg-white p-5"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="m-0 text-[17px] font-bold tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            {job.title}
          </h3>
          <p
            className="mt-0.5 text-sm"
            style={{ color: "var(--gg-ink-2)" }}
          >
            {[job.company, job.location].filter(Boolean).join(" · ")}
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
        <div className="flex flex-shrink-0 gap-2">
          <a
            href={`tel:${HOTLINE.replace(/\s/g, "")}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white"
            style={{ background: "var(--gg-green)" }}
          >
            <IconPhone width={13} height={13} /> Call to apply
          </a>
          {job.applyUrl && (
            <a
              href={job.applyUrl}
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
          )}
        </div>
      </div>
    </article>
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
