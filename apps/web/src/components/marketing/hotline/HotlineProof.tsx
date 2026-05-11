type Mode = "worker" | "employer";

export function HotlineProof({ mode }: { mode: Mode }) {
  const stats =
    mode === "worker"
      ? [
          { n: "12,400+", l: "Live jobs right now" },
          { n: "< 2 min", l: "Avg. call length" },
          { n: "32", l: "Languages supported" },
          { n: "94%", l: "Match in under a day" },
        ]
      : [
          { n: "4,800+", l: "Vetted candidates" },
          { n: "< 1 hr", l: "First shortlist" },
          { n: "8 ATS", l: "Integrations (Ashby, GH, …)" },
          { n: "£0", l: "Until you hire" },
        ];

  return (
    <section
      className="py-16 text-white"
      style={{ background: "var(--gg-ink)" }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 sm:grid-cols-4 sm:px-8">
        {stats.map((s, i) => (
          <div key={i}>
            <div
              className="mono font-bold tracking-tight text-white"
              style={{
                fontSize: "clamp(32px, 4vw, 48px)",
                letterSpacing: "-0.03em",
              }}
            >
              {s.n}
            </div>
            <div
              className="mt-1.5 text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              {s.l}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
