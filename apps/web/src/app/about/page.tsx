import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import {
  IconPhone,
  IconMic,
  IconBolt,
  IconGlobe,
  IconCheck,
} from "@/components/marketing/hotline/icons";

export const metadata = {
  title: "About · GigGrab",
  description:
    "GigGrab is a voice-first hiring marketplace. Workers describe their experience by talking to our AI in any language; employers brief roles the same way. Matches happen in minutes, not weeks.",
};

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "+1 551 553 4910";

export default function AboutPage() {
  return (
    <>
      <Header />
      <main
        className="flex-1"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--gg-green-tint-2) 0%, transparent 50%), var(--gg-bg)",
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
          {/* Hero */}
          <header>
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{
                borderColor: "var(--gg-line)",
                color: "var(--gg-green-dark)",
                letterSpacing: "0.06em",
              }}
            >
              <IconBolt width={13} height={13} />
              <span className="mono">About GigGrab</span>
            </div>
            <h1
              className="m-0 font-extrabold leading-[1.04] tracking-tight"
              style={{
                fontSize: "clamp(40px, 5vw, 60px)",
                color: "var(--gg-ink)",
              }}
            >
              Hiring should be a{" "}
              <span style={{ color: "var(--gg-green)" }}>conversation</span>,
              not a form.
            </h1>
            <p
              className="mt-5 max-w-2xl text-[18px] leading-relaxed"
              style={{ color: "var(--gg-ink-2)" }}
            >
              GigGrab is a voice-first hiring marketplace. Workers describe
              their experience by talking to our AI — in any language — and
              we match them to live roles. Employers brief jobs the same way:
              a five-minute call, no JD writing, ranked candidates the same
              day.
            </p>
          </header>

          {/* Why we built it */}
          <Section heading="Why we built it">
            <p>
              Most people don&apos;t have an up-to-date CV. The ones who do
              still get filtered out by keyword matches and ATS noise.
              Employers spend weeks writing job specs, posting on five
              boards, and reading the same fifty CVs back. Nobody wins.
            </p>
            <p>
              We thought: what if the whole intake — for both sides — was
              just a phone call? Workers tell us what they do, where, when,
              and for how much. Employers tell us what they need. Our AI does
              the structuring + ranking. People do the parts that matter:
              talking, interviewing, hiring.
            </p>
          </Section>

          {/* Three pillars */}
          <Section heading="What makes it different">
            <div className="grid gap-4 sm:grid-cols-3">
              <Pillar
                icon={<IconGlobe width={20} height={20} />}
                title="Any language"
                body="Our AI is fluent in 32+ languages. Workers speak the language they think in — we structure the data underneath."
              />
              <Pillar
                icon={<IconMic width={20} height={20} />}
                title="Voice over forms"
                body="Two-minute call for workers, five-minute call for employers. No CV uploads. No JD authoring. No friction."
              />
              <Pillar
                icon={<IconBolt width={20} height={20} />}
                title="Matches in minutes"
                body="We rank live roles by skills, location, pay, and shift fit. Top matches surface before the call ends — read out by our AI."
              />
            </div>
          </Section>

          {/* Who it's for */}
          <Section heading="Who it&apos;s for">
            <div className="grid gap-4 sm:grid-cols-2">
              <Audience
                kind="worker"
                title="Workers"
                lines={[
                  "Trades — site carpenters, electricians, plumbers, CSCS holders.",
                  "Healthcare — RNs, HCAs, A&E and care staff with NMC PIN.",
                  "Hospitality — chefs, FOH, baristas, sous chefs.",
                  "Logistics — HGV drivers, warehouse, last-mile.",
                  "Knowledge work — designers, engineers, customer success.",
                ]}
                cta={{ label: "Call the hotline", href: "/" }}
              />
              <Audience
                kind="employer"
                title="Employers"
                lines={[
                  "SMEs hiring without a recruiter on staff.",
                  "Agencies who want a faster vetted-pool layer alongside their ATS.",
                  "Trust + safety conscious — every intake is recorded and consented.",
                  "Volume hires — sites, wards, restaurants, fleet ops.",
                  "Plug-in ATS support — Greenhouse, Workable, Ashby, BambooHR.",
                ]}
                cta={{ label: "Start a brief", href: "/hiring" }}
              />
            </div>
          </Section>

          {/* Trust */}
          <Section heading="Trust + privacy">
            <p>
              Every call is recorded and announced. Consent is captured on
              the call audio. Personal data sits in UK-region Postgres,
              encrypted in transit and at rest, with a strict subprocessor
              list (Twilio, Anthropic, Deepgram, Groq, Cartesia, Render,
              Google Cloud). UK GDPR-aligned; full details in our{" "}
              <Link
                href="/legal/privacy"
                className="font-bold underline underline-offset-2"
                style={{ color: "var(--gg-green-dark)" }}
              >
                Privacy Policy
              </Link>
              .
            </p>
            <p>
              We don&apos;t sell data. We don&apos;t train third-party AI
              models on your CV or transcript. Employers see your profile
              only when you choose to apply.
            </p>
          </Section>

          {/* Closing CTA */}
          <section
            className="mt-16 rounded-3xl p-8 text-center text-white sm:p-12"
            style={{
              background:
                "linear-gradient(160deg, var(--gg-green) 0%, var(--gg-green-dark) 60%, var(--gg-green-deep) 100%)",
            }}
          >
            <h2
              className="m-0 text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              Try it now. Pick up the phone.
            </h2>
            <p
              className="mx-auto mt-3 max-w-md text-[15.5px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              No login, no CV, no form. Just a quick voice chat — in any
              language.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href={`tel:${HOTLINE.replace(/\s/g, "")}`}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold"
                style={{ color: "var(--gg-green-dark)" }}
              >
                <IconPhone width={16} height={16} />
                Call {HOTLINE}
              </a>
              <Link
                href="/start"
                className="inline-flex h-12 items-center gap-2 rounded-xl border-[1.5px] px-5 text-sm font-semibold text-white"
                style={{ borderColor: "rgba(255,255,255,0.4)" }}
              >
                Have us call you
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
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
    <section className="mt-14">
      <div
        className="mono mb-2 text-xs font-semibold uppercase"
        style={{
          color: "var(--gg-green-dark)",
          letterSpacing: "0.14em",
        }}
      >
        {heading}
      </div>
      <div
        className="space-y-4 text-[16px] leading-relaxed"
        style={{ color: "var(--gg-ink-2)" }}
      >
        {children}
      </div>
    </section>
  );
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-2xl border bg-white p-6"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <div
        className="mb-4 grid h-11 w-11 place-items-center rounded-xl"
        style={{
          background: "var(--gg-green-tint)",
          color: "var(--gg-green-dark)",
        }}
      >
        {icon}
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

function Audience({
  kind,
  title,
  lines,
  cta,
}: {
  kind: "worker" | "employer";
  title: string;
  lines: string[];
  cta: { label: string; href: string };
}) {
  const accent = kind === "worker" ? "👷" : "💼";
  return (
    <div
      className="rounded-2xl border bg-white p-6"
      style={{ borderColor: "var(--gg-line)" }}
    >
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 24 }}>{accent}</span>
        <h3
          className="m-0 text-xl font-extrabold tracking-tight"
          style={{ color: "var(--gg-ink)" }}
        >
          {title}
        </h3>
      </div>
      <ul className="mt-4 space-y-2.5">
        {lines.map((l) => (
          <li
            key={l}
            className="flex items-start gap-2.5 text-[14.5px] leading-snug"
            style={{ color: "var(--gg-ink-2)" }}
          >
            <span
              className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ background: "var(--gg-green)" }}
            />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-xs font-bold text-white"
        style={{ background: "var(--gg-green)" }}
      >
        {cta.label} →
      </Link>
    </div>
  );
}
