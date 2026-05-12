import type { ProfileCard } from "@/lib/types";

type Props = {
  card: ProfileCard | null;
  email?: string;
  /** Provided when we're inside a session-token-gated profile view. */
  sessionId?: string;
  token?: string;
  /** True while a snapshot extract is in flight. Shows a small spinner pill
   * in the header so users know their CV is being rebuilt right now. */
  updating?: boolean;
};

export function CvPreview({ card, email, sessionId, token, updating }: Props) {
  const pdfHref =
    sessionId && token && card
      ? `/api/sessions/${sessionId}/cv.pdf?token=${encodeURIComponent(token)}`
      : null;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">CV preview</h2>
          {updating && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider"
              style={{
                background: "var(--gg-green-tint)",
                color: "var(--gg-green-dark)",
                letterSpacing: "0.1em",
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--gg-green)",
                  animation: "glowDot 1.6s ease-in-out infinite",
                }}
              />
              Updating
            </span>
          )}
        </div>
        {pdfHref ? (
          <a
            href={pdfHref}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
          >
            ↓ PDF
          </a>
        ) : (
          <span
            className="cursor-not-allowed text-xs text-gray-400"
            title="Available once your profile has been generated."
          >
            ↓ PDF
          </span>
        )}
      </header>

      {!card ? (
        <div className="flex-1 grid place-items-center px-6 py-10 text-center">
          <p className="text-sm text-gray-400">
            We&apos;re building your CV from the call. It&apos;ll appear here in
            a moment.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-7">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight text-gray-900">
              {clean(card.name) || "Add your name"}
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              {[clean(card.title), card.yearsExperience > 0 ? `${card.yearsExperience} years` : null]
                .filter(Boolean)
                .join(" · ") || "Tell us your trade"}
            </p>
            <p className="text-sm text-gray-500">
              {[clean(card.location), email].filter(Boolean).join(" · ") || ""}
            </p>
          </div>

          {clean(card.summary) ? (
            <Section heading="Profile">
              <p className="text-sm leading-relaxed text-gray-800">
                {clean(card.summary)}
              </p>
            </Section>
          ) : (
            <Section heading="Profile">
              <p className="text-sm italic text-gray-500">
                Your profile summary will appear here after we capture more
                detail. Tap &ldquo;Call again&rdquo; below to keep adding to it.
              </p>
            </Section>
          )}

          {(() => {
            const tickets = (card.ticketsAndCards ?? [])
              .map((t) => clean(t))
              .filter(Boolean);
            return tickets.length > 0 ? (
              <Section heading="Credentials">
                <ul className="flex flex-wrap gap-2">
                  {tickets.map((t) => (
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
              </Section>
            ) : null;
          })()}

          {(card.recentProjects ?? []).filter(
            (p) =>
              p &&
              (clean(p.role) || clean(p.company) || clean(p.description)),
          ).length > 0 && (
            <Section heading="Recent projects">
              <div className="space-y-3">
                {card.recentProjects.map((p, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium text-gray-900">
                      {p.role} — {p.company}
                    </p>
                    <p className="text-xs text-gray-500">{p.period}</p>
                    {p.description && (
                      <p className="mt-1 text-sm text-gray-700">{p.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>
      )}
    </section>
  );
}

// Drop legacy "<UNKNOWN>" sentinels and trim whitespace. The newer extraction
// prompt returns "" for unset fields, but old rows from before the prompt
// update may still have "<UNKNOWN>".
function clean(s: string | undefined | null): string {
  if (!s) return "";
  const t = s.trim();
  if (!t || t === "<UNKNOWN>" || t.toLowerCase() === "unknown") return "";
  return t;
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {heading}
      </h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}
