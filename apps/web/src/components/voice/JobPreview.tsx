"use client";

/**
 * Live preview of the job posting being built mid-call. Mirrors
 * CvPreview's role for the candidate side: every ~6 transcript turns,
 * the agent's snapshot endpoint re-runs Claude over the partial
 * transcript and returns a JobDraft, which renders here.
 *
 * Empty rows render as muted placeholders so the employer sees the
 * skeleton before they've answered each prompt — useful to know what
 * the agent will ask next.
 */
import { useMemo } from "react";

export type JobDraft = {
  callerName: string | null;
  callerEmail: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  shiftPattern: string | null;
  requiredCount: number | null;
  startDate: string | null;
  duration: string | null;
  payDisplay: string | null;
  mustHaves: string[];
  dealBreakers: string[];
  interviewPreference: "ai_screening" | "with_me" | "ai_then_with_me" | null;
  structuredBrief: {
    projectScope?: string;
    whatYoullNeed?: string[];
    rateAndTiming?: string;
  } | null;
};

const INTERVIEW_LABEL: Record<string, string> = {
  ai_screening: "AI screening",
  with_me: "Direct with you",
  ai_then_with_me: "AI screen, then with you",
};

export function JobPreview({
  draft,
  updating,
}: {
  draft: JobDraft | null;
  updating?: boolean;
}) {
  const empty = useMemo(() => !draft, [draft]);
  return (
    <div
      className="rounded-2xl border bg-white p-6 shadow-sm"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <div className="flex items-center justify-between">
        <p
          className="mono text-xs font-semibold uppercase"
          style={{ color: "var(--gg-green-dark)", letterSpacing: "0.14em" }}
        >
          Live job posting
        </p>
        {updating && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{
              background: "var(--gg-green-tint-2)",
              color: "var(--gg-green-deep)",
              letterSpacing: "0.08em",
            }}
          >
            Updating…
          </span>
        )}
      </div>

      <h2
        className="mt-2 text-2xl font-extrabold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {draft?.title || (
          <span className="text-gray-300">Job title (waiting)</span>
        )}
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--gg-muted)" }}>
        {draft?.company || (
          <span className="text-gray-300">Company name will appear here</span>
        )}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Row label="Location" value={draft?.location ?? null} />
        <Row label="Pay" value={draft?.payDisplay ?? null} />
        <Row label="Workers needed" value={draft?.requiredCount?.toString() ?? null} />
        <Row label="Start" value={draft?.startDate ?? null} />
        <Row label="Duration" value={draft?.duration ?? null} />
        <Row label="Shift pattern" value={draft?.shiftPattern ?? null} />
        <Row
          label="Interview"
          value={
            draft?.interviewPreference
              ? INTERVIEW_LABEL[draft.interviewPreference] ?? null
              : null
          }
        />
        <Row label="Caller" value={draft?.callerName ?? null} />
      </dl>

      <Section label="Must-haves" items={draft?.mustHaves ?? []} />
      <Section
        label="Deal-breakers"
        items={draft?.dealBreakers ?? []}
        tone="warn"
      />

      {draft?.structuredBrief?.projectScope && (
        <div className="mt-5">
          <p
            className="mono text-[11px] font-semibold uppercase"
            style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
          >
            Scope
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--gg-ink-2)" }}>
            {draft.structuredBrief.projectScope}
          </p>
        </div>
      )}

      {empty && (
        <p
          className="mt-6 rounded-lg border border-dashed px-4 py-3 text-xs"
          style={{
            borderColor: "var(--gg-line-2)",
            color: "var(--gg-muted)",
          }}
        >
          We&apos;ll fill this in as you talk. Just answer the questions naturally —
          you don&apos;t need to remember structure.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--gg-muted)" }}
      >
        {label}
      </dt>
      <dd
        className="mt-0.5 text-sm"
        style={{ color: value ? "var(--gg-ink-2)" : "#d1d5db" }}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function Section({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "warn";
}) {
  if (items.length === 0) return null;
  const chipBg = tone === "warn" ? "#FEF3C7" : "var(--gg-green-tint-2)";
  const chipColor = tone === "warn" ? "#92400E" : "var(--gg-green-deep)";
  return (
    <div className="mt-5">
      <p
        className="mono text-[11px] font-semibold uppercase"
        style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
      >
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${label}-${i}`}
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: chipBg, color: chipColor }}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
