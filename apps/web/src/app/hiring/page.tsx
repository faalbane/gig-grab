import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { AudienceToggle } from "@/components/marketing/AudienceToggle";
import { LanguagesStrip } from "@/components/marketing/LanguagesStrip";
import { LiveMatchesPreview } from "@/components/marketing/LiveMatchesPreview";
import { ThreeStepsSection } from "@/components/marketing/ThreeStepsSection";

export default function EmployerLanding() {
  return (
    <>
      <Header />

      <main>
        <div className="border-b border-gray-100 bg-gradient-to-b from-emerald-50/60 via-emerald-50/30 to-white">
          <div className="mx-auto flex max-w-6xl justify-center px-6 pt-10">
            <AudienceToggle active="employer" />
          </div>

          <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
            <div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                💼 For employers &amp; agencies
              </span>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-gray-900 sm:text-6xl">
                Tell us the work.
                <br />
                <span className="text-emerald-600">
                  We&apos;ll find the workers.
                </span>
              </h1>
              <p className="mt-6 max-w-md text-lg text-gray-600">
                Match from our vetted pool — or plug in your own ATS. Describe
                the role by voice, upload a JD, paste a link, or connect your
                ATS — our AI ranks the best matches from our pool and yours,
                then runs AI interviews on your behalf.
              </p>

              <div className="mt-6">
                <LanguagesStrip />
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/start/hiring"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  🎙 Start recruiting →
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
                >
                  Watch 60-sec demo
                </Link>
              </div>

              <p className="mt-5 text-sm text-gray-500">
                We&apos;ll call you to record project details — takes &lt; 5
                minutes.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                ✓ 30k+ verified workers · Avg. 4 hrs to first match
              </p>
            </div>

            <div className="lg:pl-8">
              <LiveMatchesPreview audience="employer" />
            </div>
          </section>
        </div>

        <div id="how-it-works">
          <ThreeStepsSection
            heading="How it works"
            subheading="Describe the role, review the brief, pick from ranked workers."
            steps={[
              {
                title: "Describe the role — or connect your ATS",
                body: "Talk to our AI, upload a JD, paste a link, or sync Greenhouse / Workable / Ashby / BambooHR to filter your own pool.",
                icon: "🎙",
              },
              {
                title: "Review your job post",
                body: "We turn it into a clean, structured brief — edit anything.",
                icon: "📝",
              },
              {
                title: "Pick from ranked workers",
                body: "Top matches from our vetted pool and yours, with a 'why ranked' explanation.",
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
