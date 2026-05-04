export function AutoApplyCard() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-center gap-2 text-emerald-900">
        <span aria-hidden>🤖</span>
        <span className="text-sm font-semibold">Auto-apply</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-emerald-950">
        Let us apply for you
      </h3>
      <p className="mt-2 text-sm text-emerald-900">
        Set your pay floor, commute and shift preferences. We&apos;ll apply to
        top-ranked matches automatically.
      </p>
      <button className="mt-4 inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        Set up auto-apply →
      </button>
    </div>
  );
}
