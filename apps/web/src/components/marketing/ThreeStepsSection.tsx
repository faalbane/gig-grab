type Step = { title: string; body: string };

type Props = {
  heading: string;
  steps: [Step, Step, Step];
};

export function ThreeStepsSection({ heading, steps }: Props) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-semibold tracking-tight text-gray-900">
        {heading}
      </h2>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className="rounded-2xl border border-gray-200 bg-white p-6"
          >
            <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700">
              {i + 1}
            </div>
            <h3 className="mt-4 font-semibold text-gray-900">{s.title}</h3>
            <p className="mt-2 text-sm text-gray-600">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
