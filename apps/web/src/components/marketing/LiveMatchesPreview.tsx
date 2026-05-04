type Match = {
  title: string;
  employer: string;
  detail: string;
  matchPct: number;
};

type Props = {
  audience: "worker" | "employer";
  newCount?: number;
};

const WORKER_MATCHES: Match[] = [
  { title: "Senior Product Designer", employer: "Northwind Labs", detail: "Remote · £75k", matchPct: 98 },
  { title: "Registered Nurse", employer: "Mercy NHS Trust", detail: "Leeds · £36k", matchPct: 98 },
  { title: "Site Carpenter", employer: "Bayford Build", detail: "Manchester · £220/day", matchPct: 98 },
];

const EMPLOYER_MATCHES: Match[] = [
  { title: "Marcus T. — Site Carpenter", employer: "12 yrs · Gold CSCS", detail: "Manchester · £220/day", matchPct: 98 },
  { title: "Priya R. — Product Designer", employer: "9 yrs · ex-Spotify", detail: "Remote · £72k", matchPct: 98 },
  { title: "Daniel K. — Sous Chef", employer: "8 yrs · fine dining", detail: "Bristol · £32k", matchPct: 98 },
];

export function LiveMatchesPreview({ audience, newCount = 3 }: Props) {
  const matches = audience === "worker" ? WORKER_MATCHES : EMPLOYER_MATCHES;
  const heading = audience === "worker" ? "Live matches preview" : "Top matched workers";
  const ctaLine =
    audience === "worker"
      ? { headline: "2-minute call", sub: "Avg. setup time" }
      : { headline: "5-minute intake", sub: "Avg. setup time" };

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">{heading}</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          {newCount} new
        </span>
      </div>

      <ul className="divide-y divide-gray-100">
        {matches.map((m) => (
          <li key={m.title} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{m.title}</p>
              <p className="truncate text-xs text-gray-500">
                {m.employer} · {m.detail}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {m.matchPct}% match
            </span>
          </li>
        ))}
      </ul>

      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            🎙
          </span>
          <span>
            <span className="font-medium text-gray-900">{ctaLine.headline}</span>
            <span className="text-gray-500"> · {ctaLine.sub}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
