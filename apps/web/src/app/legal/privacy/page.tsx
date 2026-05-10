// LEGAL: Placeholder copy modelled on UK GDPR Art. 13 + ICO guidance + the
// structure used by ElevenLabs / Vapi / Indeed. Review with a UK
// employment-tech / data-protection solicitor BEFORE pilot launch. The
// "Data we collect" and "Subprocessors" tables must remain accurate as the
// stack changes — keep them in sync with CLOUD.md.

import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Privacy Policy · GigGrab",
  description:
    "How GigGrab collects, uses, and protects personal data when you use our voice-first hiring service.",
};

const LAST_UPDATED = "2026-05-10";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="bg-white">
        <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <header className="border-b border-gray-100 pb-6">
            <p className="text-xs uppercase tracking-wider text-emerald-700">
              Legal
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-gray-500">
              Last updated: {LAST_UPDATED}
            </p>
          </header>

          <div className="prose prose-sm prose-gray mt-8 max-w-none text-gray-800">
            <Section heading="1. Who we are">
              <p>
                GigGrab Ltd (&ldquo;<strong>GigGrab</strong>&rdquo;, &ldquo;we&rdquo;,
                &ldquo;us&rdquo;) is a voice-first hiring platform registered in
                England &amp; Wales. We are the data controller for personal
                data processed through our website, hotline, and voice agent.
              </p>
              <p>
                Contact: <a href="mailto:privacy@gig-grab.com">privacy@gig-grab.com</a>
              </p>
            </Section>

            <Section heading="2. Data we collect">
              <ul>
                <li>
                  <strong>Identity &amp; contact:</strong> name, mobile phone
                  number, email address, country, language preference.
                </li>
                <li>
                  <strong>Profile data:</strong> trade, years of experience,
                  certifications &amp; tickets, recent jobs, location and
                  travel preferences, availability, pay expectations,
                  deal-breakers.
                </li>
                <li>
                  <strong>Call &amp; voice data:</strong> audio of your calls
                  with our AI recruiter, transcripts of those calls, call
                  metadata (start/end times, duration, phone number,
                  CallSid).
                </li>
                <li>
                  <strong>Authentication data:</strong> Firebase user ID, the
                  identity provider you used (Google, Microsoft, email link,
                  phone), and verification timestamps.
                </li>
                <li>
                  <strong>Technical data:</strong> IP address, device type,
                  browser, request logs.
                </li>
              </ul>
            </Section>

            <Section heading="3. How we collect it">
              <ul>
                <li>You submit it via our website (e.g. the intake form on /start).</li>
                <li>You speak it during a phone call to our hotline or an outbound call we place to you.</li>
                <li>You speak it via the browser microphone flow at /voice.</li>
                <li>Your authentication provider returns it when you sign in.</li>
              </ul>
            </Section>

            <Section heading="4. Why we use it (purposes &amp; legal basis)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 pr-4">Purpose</th>
                    <th className="py-2">Legal basis (UK GDPR Art. 6)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <Row
                    purpose="Run the intake call and build your CV"
                    basis="Contract — taking steps at your request to provide the service"
                  />
                  <Row
                    purpose="Match you to live job roles"
                    basis="Contract"
                  />
                  <Row
                    purpose="Send you SMS or email with your profile link and matches"
                    basis="Contract; Consent for marketing emails (you can unsubscribe)"
                  />
                  <Row
                    purpose="Authenticate you and secure the service"
                    basis="Legitimate interests — service security and abuse prevention"
                  />
                  <Row
                    purpose="Improve speech recognition and matching quality"
                    basis="Legitimate interests — kept under review; you can object"
                  />
                  <Row
                    purpose="Comply with legal obligations (e.g. fraud, AML, court orders)"
                    basis="Legal obligation"
                  />
                </tbody>
              </table>
            </Section>

            <Section heading="5. Call recording">
              <p>
                Calls to and from our hotline, and conversations through the
                browser microphone flow, are recorded and transcribed so we
                can build your profile and surface matches. The agent
                announces this at the start of every call. If you do not
                want to be recorded, please end the call.
              </p>
            </Section>

            <Section heading="6. Automated decision-making">
              <p>
                We use AI to transcribe your voice, extract a structured
                profile from the transcript, and rank job matches. Matching
                ranks are decision <em>support</em> — final hiring decisions
                are made by employers, not by GigGrab. You have the right to
                request human review of any automated processing that
                produces legal or similarly significant effects on you (UK
                GDPR Art. 22).
              </p>
            </Section>

            <Section heading="7. Who we share data with (subprocessors)">
              <p>
                We use the following processors. Each is bound by a written
                data-processing agreement and is only permitted to use data
                on our instructions.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 pr-4">Processor</th>
                    <th className="py-2 pr-4">Purpose</th>
                    <th className="py-2">Region</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <Sub name="Twilio" purpose="Telephony, SMS, phone verification" region="EU / US" />
                  <Sub name="Anthropic (Claude)" purpose="Profile extraction, matching reasoning" region="US" />
                  <Sub name="Deepgram" purpose="Speech-to-text" region="US" />
                  <Sub name="Groq" purpose="Real-time conversational LLM" region="US" />
                  <Sub name="Cartesia" purpose="Text-to-speech" region="US" />
                  <Sub name="Render" purpose="Voice-agent hosting" region="EU (Frankfurt)" />
                  <Sub name="Google Cloud / Firebase" purpose="API hosting, database, authentication, web hosting" region="EU (London) / Global" />
                </tbody>
              </table>
              <p>
                We do <strong>not</strong> sell your personal data and we do
                not share it with employers without your explicit decision
                to apply.
              </p>
            </Section>

            <Section heading="8. International transfers">
              <p>
                Some processors above operate in the United States. Where
                personal data leaves the UK, we rely on the UK
                International Data Transfer Addendum to the EU Standard
                Contractual Clauses, the UK Extension to the EU-US Data
                Privacy Framework where applicable, or another lawful
                transfer mechanism.
              </p>
            </Section>

            <Section heading="9. How long we keep it">
              <ul>
                <li>
                  <strong>Profile data:</strong> while your account is
                  active, plus 12 months after your last interaction.
                </li>
                <li>
                  <strong>Call recordings:</strong> 90 days, then deleted.
                </li>
                <li>
                  <strong>Transcripts:</strong> 24 months from the call.
                </li>
                <li>
                  <strong>Authentication / security logs:</strong> 12 months.
                </li>
              </ul>
              <p>
                You can request earlier deletion at any time (see &ldquo;Your
                rights&rdquo; below).
              </p>
            </Section>

            <Section heading="10. Your rights">
              <p>Under UK GDPR you have the right to:</p>
              <ul>
                <li>Access the personal data we hold about you.</li>
                <li>Have inaccurate data corrected.</li>
                <li>Have your data erased (&ldquo;right to be forgotten&rdquo;).</li>
                <li>Restrict or object to certain processing.</li>
                <li>Receive your data in a portable format.</li>
                <li>Withdraw consent at any time, where consent is the basis.</li>
                <li>
                  Lodge a complaint with the Information Commissioner&rsquo;s
                  Office (<a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>).
                </li>
              </ul>
              <p>
                To exercise any of these, email{" "}
                <a href="mailto:privacy@gig-grab.com">privacy@gig-grab.com</a>.
                We respond within one month.
              </p>
            </Section>

            <Section heading="11. Cookies">
              <p>
                We use only strictly necessary cookies (authentication
                session, CSRF). We do not use advertising or third-party
                analytics cookies at this time. If that changes we will
                update this policy and surface a cookie banner before any
                non-essential cookie is set.
              </p>
            </Section>

            <Section heading="12. Security">
              <p>
                Data is encrypted in transit (TLS 1.2+) and at rest. Access
                to production systems is restricted to a small number of
                authorised engineers and audit-logged. Our database
                connections use TLS with strong cipher suites.
              </p>
            </Section>

            <Section heading="13. Children">
              <p>
                GigGrab is not directed at children. You must be at least
                18 years old, or the legal age to work in your country, to
                use the service.
              </p>
            </Section>

            <Section heading="14. Changes">
              <p>
                We&rsquo;ll update this policy when our practices change.
                Material changes are notified by email or prominent in-app
                notice at least 14 days before they take effect.
              </p>
            </Section>

            <Section heading="15. Contact">
              <p>
                Questions, requests, or complaints:{" "}
                <a href="mailto:privacy@gig-grab.com">privacy@gig-grab.com</a>.
              </p>
              <p>
                See also our{" "}
                <Link
                  href="/legal/terms"
                  className="text-emerald-700 underline hover:text-emerald-800"
                >
                  Terms of Service
                </Link>
                .
              </p>
            </Section>
          </div>
        </article>
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
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}

function Row({ purpose, basis }: { purpose: string; basis: string }) {
  return (
    <tr>
      <td className="py-2 pr-4 align-top">{purpose}</td>
      <td className="py-2 align-top">{basis}</td>
    </tr>
  );
}

function Sub({
  name,
  purpose,
  region,
}: {
  name: string;
  purpose: string;
  region: string;
}) {
  return (
    <tr>
      <td className="py-2 pr-4 align-top font-medium text-gray-900">{name}</td>
      <td className="py-2 pr-4 align-top">{purpose}</td>
      <td className="py-2 align-top">{region}</td>
    </tr>
  );
}
