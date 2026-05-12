import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import {
  IconPhone,
  IconCheck,
  IconBolt,
} from "@/components/marketing/hotline/icons";

export const metadata = {
  title: "Pricing · GigGrab",
  description:
    "GigGrab is in pilot — pricing is set per employer based on volume and role mix. Contact us and we'll quote you in a 15-minute call.",
};

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

export default function PricingPage() {
  return (
    <>
      <Header />
      <main
        className="flex-1"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--gg-green-tint-2) 0%, transparent 55%), var(--gg-bg)",
          position: "relative",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(135deg, transparent 0 60px, rgba(14,159,74,0.025) 60px 61px)",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 py-14 sm:py-20">
          <header className="text-center">
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{
                borderColor: "var(--gg-line)",
                color: "var(--gg-green-dark)",
                letterSpacing: "0.06em",
              }}
            >
              <IconBolt width={13} height={13} />
              <span className="mono">Pilot pricing</span>
            </div>
            <h1
              className="m-0 font-extrabold leading-[1.05] tracking-tight"
              style={{
                fontSize: "clamp(40px, 5vw, 60px)",
                color: "var(--gg-ink)",
              }}
            >
              Let&apos;s talk.{" "}
              <span style={{ color: "var(--gg-green)" }}>
                We&apos;ll quote you.
              </span>
            </h1>
            <p
              className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed"
              style={{ color: "var(--gg-ink-2)" }}
            >
              We&apos;re in a closed pilot with a small group of employers and
              agencies. Pricing depends on the roles you fill, the volume,
              and whether you use our vetted pool or your own ATS. A
              15-minute call sorts it all out — no commitment.
            </p>
          </header>

          {/* Primary CTA card */}
          <section
            className="mx-auto mt-12 max-w-2xl rounded-3xl border bg-white p-8 sm:p-10"
            style={{
              borderColor: "var(--gg-line)",
              boxShadow:
                "0 30px 80px -50px rgba(14,40,22,0.25), 0 2px 6px rgba(14,40,22,0.04)",
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-full"
                style={{
                  background: "var(--gg-green-tint)",
                  color: "var(--gg-green-dark)",
                }}
              >
                <IconPhone width={24} height={24} />
              </div>
              <div className="flex-1">
                <h2
                  className="m-0 text-2xl font-extrabold tracking-tight"
                  style={{ color: "var(--gg-ink)" }}
                >
                  Contact us and we&apos;ll get you set up.
                </h2>
                <p
                  className="mt-2 text-[15px] leading-relaxed"
                  style={{ color: "var(--gg-muted)" }}
                >
                  Tell us what you&apos;re hiring for. We&apos;ll book a quick
                  call, take the brief, and send you live, ranked candidates
                  the same day.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/hiring"
                className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-bold text-white"
                style={{ background: "var(--gg-green)" }}
              >
                <IconPhone width={16} height={16} />
                Start with a brief call
              </Link>
              <a
                href={`tel:${HOTLINE.replace(/\s/g, "")}`}
                className="inline-flex h-12 items-center gap-2 rounded-xl border-[1.5px] bg-white px-5 text-sm font-semibold"
                style={{
                  borderColor: "var(--gg-line-2)",
                  color: "var(--gg-ink)",
                }}
              >
                Or call {HOTLINE}
              </a>
              <a
                href="mailto:hello@giggrab.io?subject=Pricing%20enquiry"
                className="inline-flex h-12 items-center gap-2 rounded-xl border-[1.5px] bg-white px-5 text-sm font-semibold"
                style={{
                  borderColor: "var(--gg-line-2)",
                  color: "var(--gg-ink)",
                }}
              >
                Email hello@giggrab.io
              </a>
            </div>
          </section>

          {/* What's included in the pilot */}
          <section className="mt-14">
            <div className="text-center">
              <div
                className="mono text-xs font-semibold uppercase"
                style={{
                  color: "var(--gg-green-dark)",
                  letterSpacing: "0.14em",
                }}
              >
                What&apos;s included
              </div>
              <h2
                className="mt-1.5 text-3xl font-extrabold tracking-tight"
                style={{ color: "var(--gg-ink)" }}
              >
                Pilot perks
              </h2>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <PerkCard
                title="Unlimited intake calls"
                body="Brief by voice as many roles as you need. We turn each call into a structured JD you can edit."
              />
              <PerkCard
                title="Vetted candidate pool"
                body="Surface live workers in your trade, ranked by skills + location. Or plug in your own ATS."
              />
              <PerkCard
                title="No platform fee"
                body="Pilot users don't pay for the platform. We agree a per-hire success fee up front, in writing."
              />
            </div>
          </section>

          {/* For workers */}
          <section className="mt-14 text-center">
            <p
              className="mx-auto inline-flex max-w-xl items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm"
              style={{
                borderColor: "var(--gg-line)",
                color: "var(--gg-ink-2)",
              }}
            >
              <IconCheck
                width={14}
                height={14}
                style={{ color: "var(--gg-green-dark)" }}
              />
              <span>
                Workers — GigGrab is always free for you.{" "}
                <Link
                  href="/"
                  className="font-bold"
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  Call the hotline →
                </Link>
              </span>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function PerkCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-2xl border bg-white p-6"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <div
        className="mb-4 grid h-10 w-10 place-items-center rounded-xl"
        style={{
          background: "var(--gg-green-tint)",
          color: "var(--gg-green-dark)",
        }}
      >
        <IconCheck width={18} height={18} />
      </div>
      <h3
        className="m-0 text-[17px] font-bold tracking-tight"
        style={{ color: "var(--gg-ink)" }}
      >
        {title}
      </h3>
      <p
        className="mt-1.5 text-[14.5px] leading-relaxed"
        style={{ color: "var(--gg-muted)" }}
      >
        {body}
      </p>
    </div>
  );
}
