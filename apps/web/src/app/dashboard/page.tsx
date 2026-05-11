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

function JobsTab({ onBackToProfile }: { onBackToProfile: () => void }) {
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
        We&apos;re connecting employers right now — live, vetted roles will
        start surfacing here over the coming days. We&apos;ll text you the
        moment your first matches drop. Please check back soon.
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
