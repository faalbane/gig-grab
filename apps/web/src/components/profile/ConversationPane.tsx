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
        {turns.map((t) => (
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
