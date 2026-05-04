"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { LANGUAGES, type LanguageEntry } from "@/lib/languages";

type Props = {
  value: string;
  onChange: (lang: LanguageEntry) => void;
};

export function LanguagePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => LANGUAGES.find((l) => l.code === value) ?? LANGUAGES[0],
    [value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        listRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2.5 text-left text-sm hover:border-gray-400"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-2">
          <span className="text-base leading-none">{selected.flag}</span>
          <span className="font-medium">{selected.nativeName}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">{selected.name}</span>
        </span>
        <span className="text-gray-400">↓</span>
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
        >
          <div className="border-b border-gray-100 p-2">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${LANGUAGES.length}+ languages…`}
              className="w-full rounded-md border-0 bg-gray-50 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <ul
            role="listbox"
            className="max-h-64 overflow-y-auto py-1 text-sm"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-gray-500">No matches.</li>
            )}
            {filtered.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(l);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${
                    l.code === selected.code ? "bg-emerald-50" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">{l.flag}</span>
                    <span className="font-medium">{l.nativeName}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{l.name}</span>
                  </span>
                  {l.code === selected.code && (
                    <span className="text-emerald-600">✓</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
