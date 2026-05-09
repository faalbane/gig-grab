"use client";

import { useState } from "react";
import type { TranscriptTurn } from "@/lib/types";

type Props = {
  turns: TranscriptTurn[];
  onSend?: (text: string) => Promise<void>;
};

export function ConversationPane({ turns, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !onSend) return;
    setSending(true);
    try {
      await onSend(draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Add or correct anything — your CV updates automatically.
        </p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
        {turns.length === 0 && (
          <p className="text-sm text-gray-400">
            Your conversation will appear here once the call ends.
          </p>
        )}
        {coalesce(turns).map((t) => (
          <TurnBubble key={t.id} turn={t} />
        ))}
      </div>

      {onSend && (
        <form onSubmit={submit} className="border-t border-gray-100 p-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add or correct anything…"
              className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Combine consecutive same-speaker rows into one bubble and tighten the
// punctuation spacing left over by per-token LLM streaming. Handles legacy
// rows written before the agent started buffering full assistant turns.
function coalesce(turns: TranscriptTurn[]): TranscriptTurn[] {
  const out: TranscriptTurn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.speaker === t.speaker) {
      out[out.length - 1] = { ...last, text: clean(last.text + " " + t.text) };
    } else {
      out.push({ ...t, text: clean(t.text) });
    }
  }
  return out;
}

function clean(s: string): string {
  let t = (s ?? "").trim();
  // Strip a single layer of wrapping quotes.
  const pairs: [string, string][] = [['"', '"'], ["“", "”"], ["'", "'"], ["‘", "’"]];
  for (const [o, c] of pairs) {
    if (t.length >= 2 && t.startsWith(o) && t.endsWith(c)) {
      t = t.slice(1, -1).trim();
      break;
    }
  }
  return t
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+'(\w)/g, "'$1");
}

function TurnBubble({ turn }: { turn: TranscriptTurn }) {
  const isAi = turn.speaker === "ai";
  return (
    <div className={`flex ${isAi ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isAi
            ? "bg-gray-100 text-gray-900"
            : "bg-emerald-600 text-white"
        }`}
      >
        {turn.text}
      </div>
    </div>
  );
}
