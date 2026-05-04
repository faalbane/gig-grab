import type { Match } from "@/lib/types";

type Props = { match: Match };

export function MatchCard({ match }: Props) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-semibold text-gray-900">
            {match.jobTitle}
          </h3>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {match.matchPct}% match
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">{match.employer}</p>
        <p className="mt-2 text-xs text-gray-500">
          {match.detail}
          {match.pay ? ` · ${match.pay}` : ""}
        </p>
        {match.whyRanked && (
          <p className="mt-2 text-xs italic text-gray-500">
            Why ranked: {match.whyRanked}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Save"
          className="grid h-9 w-9 place-items-center rounded-md border border-gray-300 hover:border-gray-400"
        >
          ☆
        </button>
        <button className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          Apply
        </button>
      </div>
    </article>
  );
}
