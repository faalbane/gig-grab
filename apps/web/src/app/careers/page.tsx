import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import {
  IconPhone,
  IconBolt,
  IconCheck,
} from "@/components/marketing/hotline/icons";

export const metadata = {
  title: "Careers · GigGrab",
  description:
    "Build the voice-first hiring marketplace. Small founding team, pilot live, hiring engineers and design across the stack.",
};

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

export default function CareersPage() {
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
              <span className="mono">Join us</span>
            </div>
            <h1
              className="m-0 font-extrabold leading-[1.05] tracking-tight"
              style={{
                fontSize: "clamp(40px, 5vw, 60px)",
                color: "var(--gg-ink)",
              }}
            >
              Build the{" "}
              <span style={{ color: "var(--gg-green)" }}>voice-first</span>{" "}
              hiring layer.
            </h1>
            <p
              className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed"
              style={{ color: "var(--gg-ink-2)" }}
            >
              We&apos;re a tiny founding team. Pilot is live. We&apos;re hiring
              quietly across engineering, design, and growth — full-time and
              fractional both fine. Tell us what you do and we&apos;ll find
              the fit.
            </p>
          </header>

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
                  Apply by talking — same as anyone else.
                </h2>
                <p
                  className="mt-2 text-[15px] leading-relaxed"
                  style={{ color: "var(--gg-muted)" }}
                >
                  Eating our own dog food. Call the hotline, tell our AI what
                  you do, and we&apos;ll be in touch. Or email us directly.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`tel:${HOTLINE.replace(/\s/g, "")}`}
                className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-bold text-white"
                style={{ background: "var(--gg-green)" }}
              >
                <IconPhone width={16} height={16} />
                Call {HOTLINE}
              </a>
              <a
                href="mailto:hello@giggrab.io?subject=Careers"
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

          <section className="mt-14">
            <div className="text-center">
              <div
                className="mono text-xs font-semibold uppercase"
                style={{
                  color: "var(--gg-green-dark)",
                  letterSpacing: "0.14em",
                }}
              >
                Where we&apos;d love help
              </div>
              <h2
                className="mt-1.5 text-3xl font-extrabold tracking-tight"
                style={{ color: "var(--gg-ink)" }}
              >
                Open shapes
              </h2>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <Role
                title="Voice + LLM engineer"
                body="Push the agent stack — Pipecat / Deepgram / Cartesia / Claude. Latency-shaving, prompt tuning, multilingual."
              />
              <Role
                title="Full-stack engineer"
                body="Next.js + Cloud Run + Postgres + pgvector. Build the matching engine, the employer dashboard, the apply flow."
              />
              <Role
                title="Founding designer"
                body="Voice-first product design. Help us evolve the hotline brand into a category-defining marketplace."
              />
            </div>
          </section>

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
                Don&apos;t see your shape? Call anyway —{" "}
                <Link
                  href="/about"
                  className="font-bold"
                  style={{ color: "var(--gg-green-dark)" }}
                >
                  read what we&apos;re building
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

function Role({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-2xl border bg-white p-6"
      style={{ borderColor: "var(--gg-line)" }}
    >
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
