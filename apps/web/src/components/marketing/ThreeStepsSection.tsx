type Step = { title: string; body: string; icon?: string };

type Props = {
  heading: string;
  subheading?: string;
  steps: [Step, Step, Step];
};

export function ThreeStepsSection({ heading, subheading, steps }: Props) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-semibold tracking-tight text-gray-900">
        {heading}
      </h2>
      {subheading && (
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-gray-600">
          {subheading}
        </p>
      )}
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className="rounded-2xl border border-gray-200 bg-white p-6"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                {i + 1}
              </span>
              {s.icon && (
                <span
                  className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-base text-emerald-700"
                  aria-hidden
                >
                  {s.icon}
                </span>
              )}
            </div>
            <h3 className="mt-5 font-semibold text-gray-900">{s.title}</h3>
            <p className="mt-2 text-sm text-gray-600">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
