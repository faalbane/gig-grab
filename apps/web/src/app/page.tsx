import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { AudienceToggle } from "@/components/marketing/AudienceToggle";
import { LanguagesStrip } from "@/components/marketing/LanguagesStrip";
import { LiveMatchesPreview } from "@/components/marketing/LiveMatchesPreview";
import { ThreeStepsSection } from "@/components/marketing/ThreeStepsSection";

export default function WorkerLanding() {
  return (
    <>
      <Header />

      <main>
        <div className="border-b border-gray-100 bg-gradient-to-b from-emerald-50/60 via-emerald-50/30 to-white">
          <div className="mx-auto flex max-w-6xl justify-center px-6 pt-10">
            <AudienceToggle active="worker" />
          </div>

          <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
            <div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                ⚡ For every kind of worker
              </span>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-gray-900 sm:text-6xl">
                Speak it.
                <br />
                Match it.
                <br />
                <span className="text-emerald-600">Get hired.</span>
              </h1>
              <p className="mt-6 max-w-md text-lg text-gray-600">
                No CV. No forms. Just a quick voice chat with our AI recruiter
                — in any language — and we&apos;ll match you to live jobs in
                your field.
              </p>

              <div className="mt-6">
                <LanguagesStrip />
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/start"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  🎙 Start speaking →
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
                >
                  How it works
                </Link>
              </div>

              <p className="mt-5 text-sm text-gray-500">
                ✓ Verified employers · 12k+ live jobs
              </p>
            </div>

            <div className="lg:pl-8">
              <LiveMatchesPreview audience="worker" />
            </div>
          </section>
        </div>

        <div id="how-it-works">
          <ThreeStepsSection
            heading="How it works"
            subheading="Get matched to jobs that fit your skills, location, and schedule."
            steps={[
              {
                title: "Speak (any language)",
                body: "Tell our AI what you do, where you'd work, and what you're looking for — in your native language.",
                icon: "🎙",
              },
              {
                title: "Get matched",
                body: "We rank live jobs by skills, location and pay — best first.",
                icon: "🌐",
              },
              {
                title: "Apply & get hired",
                body: "One-tap apply, or let us auto-apply on your behalf.",
                icon: "⚡",
              },
            ]}
          />
        </div>
      </main>

      <Footer />
    </>
  );
}
