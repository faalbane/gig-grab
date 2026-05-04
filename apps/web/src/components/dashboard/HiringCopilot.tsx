"use client";

import { useState } from "react";

type Suggestion = string;

type Props = {
  suggestions: Suggestion[];
  placeholder: string;
};

export function HiringCopilot({ suggestions, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  function applySuggestion(s: string) {
    setQuery(s);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    // TODO Phase 2: POST /api/copilot/refine with the query and re-rank matches.
    setTimeout(() => setBusy(false), 600);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 text-gray-900">
        <span aria-hidden>🪄</span>
        <span className="text-sm font-semibold">Hiring Copilot</span>
      </div>
      <p className="mt-2 text-xs text-gray-600">
        Refine your matches by voice or text.
      </p>

      <form onSubmit={submit} className="mt-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            aria-label="Speak"
            className="grid h-9 w-9 place-items-center rounded-md border border-gray-300 hover:border-gray-400"
          >
            🎙
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => applySuggestion(s)}
            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:border-gray-300 hover:bg-white"
          >
            {s}
          </button>
        ))}
      </div>

      {busy && (
        <p className="mt-3 text-xs text-gray-500">Refining matches…</p>
      )}
    </div>
  );
}
