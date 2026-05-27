"use client";

/**
 * Team admin console. Password-gated (single shared secret =
 * INGEST_SECRET; reusing the existing gate rather than minting a
 * second). Password is cached in sessionStorage so the page survives
 * navigations within the tab; cleared by browser close.
 *
 * Shows recent sessions + click → live transcript. PII minimised:
 * phone numbers come from the backend already masked to last-4.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "gg.adminPw";

type SessionRow = {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  candidateId: string | null;
  phoneMasked: string | null;
  phone: string | null;
  name: string | null;
  title: string | null;
  years: number | null;
  location: string | null;
  turnCount: number;
};

type MatchRow = {
  id: string;
  title: string;
  company: string | null;
  location: string;
  pay: string | null;
  applyUrl: string | null;
  distance: number | null;
};

type Turn = {
  ord: number;
  speaker: "ai" | "candidate" | "employer";
  text: string;
};

type InspectResponse = {
  session: {
    id: string;
    kind: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    audioUrl?: string | null;
  };
  candidate: { phone: string; email: string | null } | null;
  profileCard: { name?: string; title?: string; yearsExperience?: number; location?: string; summary?: string } | null;
  transcript: Turn[];
  topMatches?: MatchRow[];
  summary?: { turnCount: number; cardName?: string | null };
};

export default function AdminPage() {
  const [pw, setPw] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setPw(stored);
  }, []);

  if (!pw) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1
          className="m-0 text-2xl font-extrabold tracking-tight"
          style={{ color: "var(--gg-ink)" }}
        >
          GigGrab admin
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--gg-muted)" }}
        >
          Internal team only. Paste the admin secret to view call
          transcripts.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!pwInput.trim()) return;
            sessionStorage.setItem(STORAGE_KEY, pwInput.trim());
            setPw(pwInput.trim());
          }}
          className="mt-5 space-y-3"
        >
          <input
            type="password"
            autoComplete="off"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Admin secret"
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            style={{ borderColor: "var(--gg-line-2)" }}
          />
          <button
            type="submit"
            className="w-full rounded-md px-4 py-2 text-sm font-bold text-white"
            style={{ background: "var(--gg-ink)" }}
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  return <AdminConsole pw={pw} onSignOut={() => { sessionStorage.removeItem(STORAGE_KEY); setPw(null); }} />;
}

function AdminConsole({
  pw,
  onSignOut,
}: {
  pw: string;
  onSignOut: () => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<InspectResponse | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(false);

  useEffect(() => {
    setSessions(null);
    setErr(null);
    fetch("/api/admin/sessions/recent?limit=50", {
      headers: { "x-ingest-secret": pw },
    })
      .then(async (r) => {
        if (r.status === 401) {
          onSignOut();
          throw new Error("invalid admin secret");
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { sessions: SessionRow[] };
        setSessions(j.sessions ?? []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "load failed"));
  }, [pw, onSignOut]);

  async function openSession(id: string) {
    setSelectedId(id);
    setInspect(null);
    setLoadingInspect(true);
    try {
      const r = await fetch(`/api/admin/inspect-session/${id}`, {
        headers: { "x-ingest-secret": pw },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setInspect((await r.json()) as InspectResponse);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "inspect failed");
    } finally {
      setLoadingInspect(false);
    }
  }

  async function deleteSession(id: string) {
    if (
      !confirm(
        "Permanently delete this session and its transcript? The candidate row + matches + Twilio recording are NOT deleted.",
      )
    ) {
      return;
    }
    try {
      const r = await fetch(`/api/admin/sessions/${id}`, {
        method: "DELETE",
        headers: { "x-ingest-secret": pw },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
      if (selectedId === id) {
        setSelectedId(null);
        setInspect(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "delete failed");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="m-0 text-xl font-extrabold tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            Admin — call transcripts
          </h1>
          <p
            className="m-0 mt-0.5 text-xs"
            style={{ color: "var(--gg-muted)" }}
          >
            Most recent sessions first. Click to view full transcript.
            PII (phone) is masked to last 4 digits.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold hover:border-gray-400"
        >
          Sign out
        </button>
      </header>

      {err && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <aside className="space-y-2">
          {!sessions ? (
            <p className="text-sm text-gray-500">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">No sessions yet.</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSession(s.id)}
                className="block w-full rounded-xl border bg-white p-3 text-left text-sm hover:border-gray-300"
                style={{
                  borderColor:
                    selectedId === s.id
                      ? "var(--gg-green-dark)"
                      : "var(--gg-line)",
                  boxShadow:
                    selectedId === s.id
                      ? "0 0 0 2px var(--gg-green-tint)"
                      : undefined,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-bold tracking-tight"
                    style={{ color: "var(--gg-ink)" }}
                  >
                    {s.name ?? "(unnamed)"}
                  </span>
                  <span
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: "var(--gg-muted)", letterSpacing: "0.08em" }}
                  >
                    {s.kind === "employer_intake" ? "employer" : "worker"}
                  </span>
                </div>
                <p
                  className="m-0 mt-0.5 text-xs"
                  style={{ color: "var(--gg-ink-2)" }}
                >
                  {s.title ?? "(no profile yet)"}
                  {s.years ? ` · ${s.years}y` : ""}
                  {s.location ? ` · ${s.location}` : ""}
                </p>
                <p
                  className="mono m-0 mt-1 text-[10px]"
                  style={{ color: "var(--gg-muted)", letterSpacing: "0.04em" }}
                >
                  {new Date(s.startedAt).toLocaleString()} ·{" "}
                  {s.durationSeconds ? `${s.durationSeconds}s` : s.status} · {s.turnCount} turns
                </p>
                {s.phone && (
                  <p
                    className="mono m-0 mt-0.5 text-[11px] font-semibold"
                    style={{ color: "var(--gg-ink-2)" }}
                  >
                    <a
                      href={`tel:${s.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: "var(--gg-green-dark)" }}
                    >
                      {s.phone}
                    </a>
                  </p>
                )}
              </button>
            ))
          )}
        </aside>

        <section>
          {!selectedId ? (
            <div
              className="rounded-2xl border bg-white p-8 text-center text-sm"
              style={{ borderColor: "var(--gg-line)", color: "var(--gg-muted)" }}
            >
              Pick a session from the left to read the transcript.
            </div>
          ) : loadingInspect || !inspect ? (
            <p className="text-sm text-gray-500">Loading transcript…</p>
          ) : (
            <TranscriptDetail
              data={inspect}
              onDelete={() => deleteSession(inspect.session.id)}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function TranscriptDetail({
  data,
  onDelete,
}: {
  data: InspectResponse;
  onDelete: () => void;
}) {
  const card = data.profileCard ?? {};
  const audioSrc = data.session.audioUrl
    ? `/api/admin/recording/${data.session.id}.mp3?k=${encodeURIComponent(
        typeof window !== "undefined"
          ? sessionStorage.getItem(STORAGE_KEY) ?? ""
          : "",
      )}`
    : null;
  return (
    <article
      className="rounded-2xl border bg-white p-5"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h2
            className="m-0 text-lg font-extrabold tracking-tight"
            style={{ color: "var(--gg-ink)" }}
          >
            {card.name ?? "(unnamed)"}
            {card.title ? ` — ${card.title}` : ""}
          </h2>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:border-red-400 hover:bg-red-50"
          >
            Delete session
          </button>
        </div>
        <p className="m-0 mt-0.5 text-xs" style={{ color: "var(--gg-muted)" }}>
          session {data.session.id.slice(0, 8)} ·{" "}
          {new Date(data.session.startedAt).toLocaleString()} ·{" "}
          {data.session.status} ·{" "}
          {data.summary?.turnCount ?? data.transcript.length} turns
        </p>
        {data.candidate?.phone && (
          <p
            className="mono m-0 mt-1.5 text-xs font-semibold"
            style={{ color: "var(--gg-ink-2)" }}
          >
            Phone:{" "}
            <a
              href={`tel:${data.candidate.phone}`}
              style={{ color: "var(--gg-green-dark)" }}
            >
              {data.candidate.phone}
            </a>
            {data.candidate.email ? (
              <>
                {" · "}
                <a
                  href={`mailto:${data.candidate.email}`}
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  {data.candidate.email}
                </a>
              </>
            ) : null}
          </p>
        )}
        {card.summary && (
          <p
            className="mt-3 rounded-md bg-gray-50 p-3 text-sm leading-relaxed"
            style={{ color: "var(--gg-ink-2)" }}
          >
            {card.summary}
          </p>
        )}
        {audioSrc && (
          <div className="mt-4">
            <p
              className="mono text-[10px] font-semibold uppercase"
              style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
            >
              Call audio
            </p>
            <audio controls src={audioSrc} className="mt-1.5 w-full" />
          </div>
        )}
      </header>

      {data.topMatches && data.topMatches.length > 0 && (
        <section className="mb-5">
          <p
            className="mono text-[10px] font-semibold uppercase"
            style={{ color: "var(--gg-muted)", letterSpacing: "0.12em" }}
          >
            Top job matches ({data.topMatches.length})
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {data.topMatches.map((m) => (
              <li
                key={m.id}
                className="rounded-md border bg-white p-2.5 text-sm"
                style={{ borderColor: "var(--gg-line)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="m-0 font-bold tracking-tight"
                      style={{ color: "var(--gg-ink)" }}
                    >
                      {m.title}
                      {m.company ? (
                        <span style={{ color: "var(--gg-ink-2)" }}>
                          {" "}@ {m.company}
                        </span>
                      ) : null}
                    </p>
                    <p
                      className="m-0 mt-0.5 text-xs"
                      style={{ color: "var(--gg-muted)" }}
                    >
                      {m.location}
                      {m.pay ? <> · {m.pay}</> : null}
                      {typeof m.distance === "number" ? (
                        <> · cosine {m.distance.toFixed(3)}</>
                      ) : null}
                    </p>
                  </div>
                  {m.applyUrl && (
                    <a
                      href={m.applyUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
                      style={{
                        background: "var(--gg-green-dark)",
                        color: "white",
                      }}
                    >
                      View ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="space-y-2">
        {data.transcript.map((t) => (
          <li
            key={t.ord}
            className={`flex ${t.speaker === "ai" ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                t.speaker === "ai"
                  ? "border border-gray-200 bg-white"
                  : "bg-emerald-600 text-white"
              }`}
            >
              {t.text}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
