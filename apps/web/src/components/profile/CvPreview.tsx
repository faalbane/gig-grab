import type { ProfileCard } from "@/lib/types";

type Props = {
  card: ProfileCard | null;
  email?: string;
};

export function CvPreview({ card, email }: Props) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">CV preview</h2>
        <button className="text-xs text-gray-500 hover:text-gray-700">
          ↓ PDF
        </button>
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
              {card.name}
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              {card.title} · {card.yearsExperience} years
            </p>
            <p className="text-sm text-gray-500">
              {card.location}
              {email ? ` · ${email}` : ""}
            </p>
          </div>

          <Section heading="Profile">
            <p className="text-sm leading-relaxed text-gray-800">
              {card.summary}
            </p>
          </Section>

          {card.ticketsAndCards.length > 0 && (
            <Section heading="Tickets & cards">
              <ul className="grid gap-1 text-sm text-gray-800 sm:grid-cols-2">
                {card.ticketsAndCards.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Section>
          )}

          {card.recentProjects.length > 0 && (
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

          <button className="text-left text-sm text-emerald-700 hover:text-emerald-800">
            + Add section
          </button>
        </div>
      )}
    </section>
  );
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
