export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-emerald-600 text-sm font-bold text-white">
              GG
            </div>
            <span className="font-semibold">GigGrab</span>
          </div>
          <nav className="hidden gap-6 text-sm text-gray-700 sm:flex">
            <a href="#workers">For workers</a>
            <a href="#employers">For employers</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About</a>
          </nav>
          <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
            Get started
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              For every kind of worker
            </span>
            <h1 className="mt-6 text-5xl font-bold tracking-tight">
              Speak it.
              <br />
              Match it.
              <br />
              <span className="text-emerald-600">Get hired.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-gray-600">
              No CV. No forms. Just a quick voice chat with our AI recruiter —
              in any language — and we&apos;ll match you to live jobs in your
              field.
            </p>
            <div className="mt-8 flex gap-3">
              <button className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white">
                Start speaking →
              </button>
              <button className="rounded-md border border-gray-300 px-5 py-3 text-sm font-medium">
                How it works
              </button>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              ✓ Verified employers · 12k+ live jobs
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Phase 0 placeholder
            </p>
            <p className="mt-2 text-sm text-gray-700">
              This is the scaffolded landing. Real designs ship in Phase 1 —
              see <code className="rounded bg-white px-1.5 py-0.5">SPEC.md</code> for the full plan.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
