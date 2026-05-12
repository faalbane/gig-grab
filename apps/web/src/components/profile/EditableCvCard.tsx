"use client";

import { useState } from "react";
import Link from "next/link";
import type { ProfileCard, ProfileProject } from "@/lib/types";
import { fetchWithAuth } from "@/lib/firebase";
import { IconPhone, IconMic, IconClose } from "@/components/marketing/hotline/icons";

type Props = {
  card: ProfileCard;
  email?: string;
  onUpdated: (next: ProfileCard) => void;
};

/** PencilIcon — small "edit" affordance per section. */
function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

type Editing =
  | null
  | "header"
  | "summary"
  | "tickets"
  | "projects";

export function EditableCvCard({ card, email, onUpdated }: Props) {
  const [editing, setEditing] = useState<Editing>(null);

  async function saveDraft(patch: Partial<ProfileCard>) {
    try {
      const data = await fetchWithAuth<{ profile: ProfileCard }>(
        "/api/account/profile",
        {
          method: "PUT",
          body: JSON.stringify(patch),
        },
      );
      onUpdated(data.profile);
      setEditing(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't save your changes.");
    }
  }

  return (
    <section
      className="flex flex-col rounded-2xl border bg-white"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
        style={{ borderBottomColor: "var(--gg-line)" }}
      >
        <h2
          className="m-0 text-sm font-bold"
          style={{ color: "var(--gg-ink)" }}
        >
          CV preview
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/start"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white"
            style={{ background: "var(--gg-green)" }}
            title="Have our AI call you to update your CV"
          >
            <IconPhone width={13} height={13} /> Call me to update
          </Link>
          <Link
            href="/voice"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold"
            style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
            title="Talk to the AI from your browser"
          >
            <IconMic width={13} height={13} /> Use my mic
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-6 px-6 py-7">
        {/* Header: name / title / years / location */}
        <SectionShell
          editing={editing === "header"}
          onEdit={() => setEditing("header")}
          onCancel={() => setEditing(null)}
        >
          {editing !== "header" ? (
            <div>
              <h3
                className="m-0 text-2xl font-extrabold tracking-tight"
                style={{ color: "var(--gg-ink)" }}
              >
                {clean(card.name) || "Add your name"}
              </h3>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--gg-ink-2)" }}
              >
                {[clean(card.title), card.yearsExperience > 0 ? `${card.yearsExperience} years` : null]
                  .filter(Boolean)
                  .join(" · ") || "Tell us your trade"}
              </p>
              <p
                className="text-sm"
                style={{ color: "var(--gg-muted)" }}
              >
                {[clean(card.location), email].filter(Boolean).join(" · ") || ""}
              </p>
            </div>
          ) : (
            <HeaderEditor
              card={card}
              onSave={(patch) => saveDraft(patch)}
              onCancel={() => setEditing(null)}
            />
          )}
        </SectionShell>

        {/* Summary */}
        <SectionShell
          heading="Profile"
          editing={editing === "summary"}
          onEdit={() => setEditing("summary")}
          onCancel={() => setEditing(null)}
        >
          {editing !== "summary" ? (
            clean(card.summary) ? (
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--gg-ink-2)" }}
              >
                {clean(card.summary)}
              </p>
            ) : (
              <p
                className="text-sm italic"
                style={{ color: "var(--gg-muted)" }}
              >
                Your profile summary will appear here. Tap the pencil to type
                one in, or call the hotline to dictate.
              </p>
            )
          ) : (
            <SimpleTextEditor
              initial={card.summary}
              placeholder="One or two sentences in your own words — what you do, where, and what you're looking for."
              onSave={(v) => saveDraft({ summary: v })}
              onCancel={() => setEditing(null)}
              multiline
            />
          )}
        </SectionShell>

        {/* Credentials — degrees, certs, tickets, awards, memberships */}
        <SectionShell
          heading="Credentials"
          editing={editing === "tickets"}
          onEdit={() => setEditing("tickets")}
          onCancel={() => setEditing(null)}
        >
          {editing !== "tickets" ? (
            (() => {
              const items = (card.ticketsAndCards ?? [])
                .map((t) => clean(t))
                .filter(Boolean);
              return items.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {items.map((t) => (
                    <li
                      key={t}
                      className="inline-flex items-center rounded-full border px-3 py-1 text-[12.5px] font-semibold"
                      style={{
                        background: "var(--gg-green-tint-2)",
                        borderColor: "var(--gg-green-tint)",
                        color: "var(--gg-green-deep)",
                      }}
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className="text-sm italic"
                  style={{ color: "var(--gg-muted)" }}
                >
                  No credentials on file. Tap the pencil to add degrees,
                  certs, tickets, or awards — one per line.
                </p>
              );
            })()
          ) : (
            <TicketsEditor
              initial={card.ticketsAndCards ?? []}
              onSave={(arr) => saveDraft({ ticketsAndCards: arr })}
              onCancel={() => setEditing(null)}
            />
          )}
        </SectionShell>

        {/* Recent projects */}
        <SectionShell
          heading="Recent projects"
          editing={editing === "projects"}
          onEdit={() => setEditing("projects")}
          onCancel={() => setEditing(null)}
        >
          {editing !== "projects" ? (
            (() => {
              const projects = (card.recentProjects ?? []).filter(
                (p) =>
                  p &&
                  (clean(p.role) || clean(p.company) || clean(p.description)),
              );
              return projects.length > 0 ? (
                <div className="space-y-3">
                  {projects.map((p, i) => (
                    <div key={i}>
                      <p
                        className="text-sm font-bold"
                        style={{ color: "var(--gg-ink)" }}
                      >
                        {clean(p.role)} — {clean(p.company)}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--gg-muted)" }}
                      >
                        {clean(p.period)}
                      </p>
                      {p.description && (
                        <p
                          className="mt-1 text-sm"
                          style={{ color: "var(--gg-ink-2)" }}
                        >
                          {clean(p.description)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  className="text-sm italic"
                  style={{ color: "var(--gg-muted)" }}
                >
                  No projects yet. Tap the pencil to add one, or call the
                  hotline and we&apos;ll capture them by voice.
                </p>
              );
            })()
          ) : (
            <ProjectsEditor
              initial={card.recentProjects ?? []}
              onSave={(arr) => saveDraft({ recentProjects: arr })}
              onCancel={() => setEditing(null)}
            />
          )}
        </SectionShell>
      </div>
    </section>
  );
}

/* ─────────── helpers ─────────── */

function SectionShell({
  heading,
  editing,
  onEdit,
  onCancel,
  children,
}: {
  heading?: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      {heading && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h4
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--gg-muted)", letterSpacing: "0.1em" }}
          >
            {heading}
          </h4>
          <EditPencil editing={editing} onEdit={onEdit} onCancel={onCancel} />
        </div>
      )}
      {!heading && (
        <div className="mb-1 flex justify-end">
          <EditPencil editing={editing} onEdit={onEdit} onCancel={onCancel} />
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

function EditPencil({
  editing,
  onEdit,
  onCancel,
}: {
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <button
      type="button"
      onClick={editing ? onCancel : onEdit}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold opacity-70 transition-opacity hover:opacity-100"
      style={{
        color: editing ? "var(--gg-muted)" : "var(--gg-green-dark)",
      }}
      aria-label={editing ? "Cancel edit" : "Edit section"}
    >
      {editing ? (
        <>
          <IconClose width={12} height={12} /> Cancel
        </>
      ) : (
        <>
          <PencilIcon size={12} /> Edit
        </>
      )}
    </button>
  );
}

function HeaderEditor({
  card,
  onSave,
  onCancel,
}: {
  card: ProfileCard;
  onSave: (patch: Partial<ProfileCard>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(card.name ?? "");
  const [title, setTitle] = useState(card.title ?? "");
  const [years, setYears] = useState<string>(
    card.yearsExperience > 0 ? String(card.yearsExperience) : "",
  );
  const [location, setLocation] = useState(card.location ?? "");

  return (
    <div className="grid gap-3">
      <FieldInput label="Name" value={name} onChange={setName} />
      <FieldInput label="Trade / role" value={title} onChange={setTitle} />
      <div className="grid grid-cols-2 gap-3">
        <FieldInput
          label="Years experience"
          value={years}
          onChange={(v) => setYears(v.replace(/[^\d]/g, ""))}
          inputMode="numeric"
        />
        <FieldInput label="Location" value={location} onChange={setLocation} />
      </div>
      <SaveCancelRow
        onCancel={onCancel}
        onSave={() =>
          onSave({
            name: name.trim(),
            title: title.trim(),
            yearsExperience: years ? Number(years) : 0,
            location: location.trim(),
          })
        }
      />
    </div>
  );
}

function SimpleTextEditor({
  initial,
  placeholder,
  onSave,
  onCancel,
  multiline,
}: {
  initial: string;
  placeholder?: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  multiline?: boolean;
}) {
  const [v, setV] = useState(initial ?? "");
  return (
    <div className="space-y-3">
      {multiline ? (
        <textarea
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          rows={4}
          autoFocus
          className="w-full rounded-xl border-[1.5px] px-3.5 py-2.5 text-sm outline-none"
          style={{ borderColor: "var(--gg-line-2)" }}
        />
      ) : (
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="h-11 w-full rounded-xl border-[1.5px] px-3.5 text-sm outline-none"
          style={{ borderColor: "var(--gg-line-2)" }}
        />
      )}
      <SaveCancelRow onCancel={onCancel} onSave={() => onSave(v.trim())} />
    </div>
  );
}

function TicketsEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string[];
  onSave: (arr: string[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial.join("\n"));
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(4, initial.length + 1)}
        autoFocus
        placeholder={"CSCS Gold\nBSc Computer Science\nFirst-aid certified\nY Combinator Alum"}
        className="w-full rounded-xl border-[1.5px] px-3.5 py-2.5 text-sm outline-none"
        style={{ borderColor: "var(--gg-line-2)" }}
      />
      <p className="text-xs" style={{ color: "var(--gg-muted)" }}>
        One per line. We&apos;ll drop blanks.
      </p>
      <SaveCancelRow
        onCancel={onCancel}
        onSave={() => {
          const arr = text
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          onSave(arr);
        }}
      />
    </div>
  );
}

function ProjectsEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: ProfileProject[];
  onSave: (arr: ProfileProject[]) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<ProfileProject[]>(
    initial.length > 0
      ? initial
      : [{ role: "", company: "", period: "", description: "" }],
  );

  function update(i: number, patch: Partial<ProfileProject>) {
    setItems((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    );
  }
  function add() {
    setItems((prev) => [
      ...prev,
      { role: "", company: "", period: "", description: "" },
    ]);
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      {items.map((p, i) => (
        <div
          key={i}
          className="rounded-xl border p-3"
          style={{ borderColor: "var(--gg-line)" }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <FieldInput
              label="Role"
              value={p.role}
              onChange={(v) => update(i, { role: v })}
            />
            <FieldInput
              label="Company / site"
              value={p.company}
              onChange={(v) => update(i, { company: v })}
            />
            <FieldInput
              label="Period"
              value={p.period}
              onChange={(v) => update(i, { period: v })}
              placeholder="e.g. 2024–2025"
            />
          </div>
          <label
            className="mt-2 block text-xs font-semibold"
            style={{ color: "var(--gg-ink-2)" }}
          >
            What you did
          </label>
          <textarea
            value={p.description ?? ""}
            onChange={(e) => update(i, { description: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg border-[1.5px] px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--gg-line-2)" }}
          />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="mt-2 text-xs"
              style={{ color: "var(--gg-muted)" }}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] bg-white px-3 text-xs font-semibold"
        style={{ borderColor: "var(--gg-line-2)", color: "var(--gg-ink)" }}
      >
        + Add another project
      </button>
      <SaveCancelRow
        onCancel={onCancel}
        onSave={() => {
          const cleaned = items
            .map((p) => ({
              role: (p.role ?? "").trim(),
              company: (p.company ?? "").trim(),
              period: (p.period ?? "").trim(),
              description: (p.description ?? "").trim(),
            }))
            .filter((p) => p.role || p.company);
          onSave(cleaned);
        }}
      />
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label className="block">
      <span
        className="block text-xs font-semibold"
        style={{ color: "var(--gg-ink-2)" }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 h-11 w-full rounded-xl border-[1.5px] px-3.5 text-sm outline-none"
        style={{ borderColor: "var(--gg-line-2)" }}
      />
    </label>
  );
}

function SaveCancelRow({
  onSave,
  onCancel,
}: {
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold"
        style={{ color: "var(--gg-muted)" }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        className="inline-flex h-9 items-center rounded-lg px-4 text-xs font-bold text-white"
        style={{ background: "var(--gg-ink)" }}
      >
        Save
      </button>
    </div>
  );
}

function clean(s: string | undefined | null): string {
  if (!s) return "";
  const t = s.trim();
  if (!t || t === "<UNKNOWN>" || t.toLowerCase() === "unknown") return "";
  return t;
}
