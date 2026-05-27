// LEGAL: Placeholder copy. Review with a UK solicitor before pilot launch.
// Liability cap, governing law, and arbitration/disputes wording in
// particular need professional review for the markets where GigGrab will
// operate. Modeled loosely on ElevenLabs/Vapi structure plus standard
// SaaS-for-recruitment terms.
//
// 2026-05-27: Added "6. SMS messaging program" section with explicit
// A2P 10DLC required disclosures (program name, message frequency,
// rates, HELP/STOP, opt-in/out, support). Twilio campaign reviewers
// look for these verbatim. Existing sections renumbered 6→7, 7→8, etc.

import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Terms of Service · GigGrab",
  description: "The agreement between you and GigGrab when you use our service.",
};

const LAST_UPDATED = "2026-05-27";

export default function TermsPage() {
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
              Terms of Service
            </h1>
            <p className="mt-3 text-sm text-gray-500">
              Last updated: {LAST_UPDATED}
            </p>
          </header>

          <div className="prose prose-sm prose-gray mt-8 max-w-none text-gray-800">
            <Section heading="1. Agreement">
              <p>
                These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;)
                are a binding agreement between you and GigGrab Ltd
                (&ldquo;<strong>GigGrab</strong>&rdquo;, &ldquo;we&rdquo;,
                &ldquo;us&rdquo;), a company registered in England &amp;
                Wales. By using our website, hotline, voice agent, SMS
                messages, or any related service (the
                &ldquo;<strong>Service</strong>&rdquo;), you agree to these
                Terms. If you don&rsquo;t agree, please don&rsquo;t use the
                Service.
              </p>
            </Section>

            <Section heading="2. What GigGrab is">
              <p>
                GigGrab is a hiring marketplace and AI-powered recruiter
                that helps workers describe their experience by voice and
                matches them to live job roles posted by employers.
              </p>
              <p>
                <strong>We are not your employer.</strong> Employment
                relationships are between you and the employer who hires
                you. GigGrab is not a party to those agreements and is not
                liable for the conduct, decisions, or pay practices of any
                employer or worker.
              </p>
            </Section>

            <Section heading="3. Eligibility">
              <ul>
                <li>You must be at least 18 years old.</li>
                <li>You must have the legal right to work in the country where you&rsquo;re seeking jobs.</li>
                <li>You must provide accurate information about yourself.</li>
              </ul>
            </Section>

            <Section heading="4. Your account">
              <p>
                You may sign in via Google, Microsoft, email link, or
                phone-number verification. Keep your sign-in credentials
                secure. You&rsquo;re responsible for activity that happens
                under your account.
              </p>
            </Section>

            <Section heading="5. Voice calls and AI processing">
              <p>
                When you talk to our AI recruiter — whether by calling our
                hotline, receiving a call from us, or using the browser
                microphone flow — the call is recorded and transcribed. The
                agent announces this at the start of every call. The
                recording and transcript are processed by our AI stack
                (described in our{" "}
                <Link href="/legal/privacy" className="text-emerald-700 underline">
                  Privacy Policy
                </Link>
                ) to build your CV and rank job matches. Final hiring
                decisions are made by employers, not by GigGrab.
              </p>
            </Section>

            <Section heading="6. SMS messaging program">
              <p>
                <strong>Program name:</strong> GigGrab Recruiter Updates.
              </p>
              <p>
                <strong>Description:</strong> After you complete a voice
                intake with our AI recruiter (by calling our hotline at
                +1 551 553 4910 or by submitting your phone number through
                our intake form at giggrab.io), we send you transactional
                SMS messages containing your top job matches, application
                status updates, employer responses, interview invitations,
                and account notifications.
              </p>
              <p>
                <strong>How you opt in:</strong> You opt in to receive SMS
                messages from GigGrab by (a) calling our hotline and
                completing the voice intake — the AI recruiter discloses
                that we will follow up by text; or (b) submitting your
                phone number through the intake form at giggrab.io, where
                you affirmatively agree to these Terms before submission.
                Providing your mobile number through either route
                constitutes your express written consent to receive
                recurring SMS messages from GigGrab at that number,
                including messages sent using an automatic telephone
                dialing system.
              </p>
              <p>
                <strong>Message frequency:</strong> Message frequency
                varies based on your activity and matched roles, typically
                1&ndash;5 messages per week. We do not send marketing or
                promotional SMS.
              </p>
              <p>
                <strong>Message and data rates may apply.</strong> You are
                responsible for any fees your mobile carrier charges to
                send or receive text messages. GigGrab does not charge for
                SMS.
              </p>
              <p>
                <strong>How to opt out:</strong> Reply{" "}
                <strong>STOP</strong> to any GigGrab SMS at any time to
                immediately and permanently unsubscribe from all SMS
                messages from this program. You will receive a single
                confirmation message and then no further texts.
              </p>
              <p>
                <strong>How to get help:</strong> Reply{" "}
                <strong>HELP</strong> to any GigGrab SMS for assistance.
                You can also email{" "}
                <a href="mailto:hello@giggrab.io">hello@giggrab.io</a>.
              </p>
              <p>
                <strong>Carrier disclaimer:</strong> Mobile carriers
                (including but not limited to AT&amp;T, T-Mobile, Verizon,
                and their affiliates) are not liable for delayed or
                undelivered messages.
              </p>
              <p>
                <strong>Privacy:</strong> We do not sell, rent, or share
                your mobile phone number or SMS opt-in data with any third
                party or affiliate for their marketing or promotional
                purposes. See our{" "}
                <Link href="/legal/privacy" className="text-emerald-700 underline">
                  Privacy Policy
                </Link>{" "}
                for details on how we handle your data.
              </p>
            </Section>

            <Section heading="7. Acceptable use">
              <p>You agree not to:</p>
              <ul>
                <li>Submit false, misleading, or third-party information.</li>
                <li>Use the Service to harass, defraud, or impersonate anyone.</li>
                <li>Attempt to scrape, reverse-engineer, or interfere with the Service.</li>
                <li>Use the Service in violation of any applicable law (including UK GDPR, the Modern Slavery Act, or sanctions regimes).</li>
                <li>Submit content that is unlawful, defamatory, infringes IP, or contains malware.</li>
                <li>Use automated systems to spam our hotline or APIs.</li>
              </ul>
              <p>
                We may suspend or terminate accounts that breach these
                rules.
              </p>
            </Section>

            <Section heading="8. Your content and licence">
              <p>
                You keep ownership of the content you provide (your voice
                recording, your transcripts, your profile data,
                &ldquo;<strong>Your Content</strong>&rdquo;). You grant
                GigGrab a worldwide, royalty-free licence to host, process,
                transmit, and display Your Content as needed to operate the
                Service and to share your profile with employers when you
                choose to apply. We do not use Your Content to train
                third-party AI models.
              </p>
            </Section>

            <Section heading="9. Employers">
              <p>
                If you&rsquo;re an employer using GigGrab, you additionally
                warrant that you have the authority to post the role, that
                postings are not discriminatory, and that you will treat
                candidates&rsquo; data lawfully and only for hiring
                purposes. Separate employer terms may apply.
              </p>
            </Section>

            <Section heading="10. Fees">
              <p>
                The candidate-facing Service is free to use at the free
                tier. Optional paid plans (described on our pricing page)
                give additional application capacity. Employers pay for
                hiring features under their separate agreement.
              </p>
            </Section>

            <Section heading="11. Service availability">
              <p>
                We aim for high availability but the Service is provided
                &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We
                don&rsquo;t guarantee uninterrupted operation, error-free
                performance, or that you&rsquo;ll be matched to a specific
                role.
              </p>
            </Section>

            <Section heading="12. Disclaimers">
              <p>
                To the fullest extent permitted by law, GigGrab disclaims
                all warranties, express or implied, including merchantability,
                fitness for a particular purpose, and non-infringement.
                GigGrab does not warrant that any match, application, or
                interview will result in an offer, or that any employer
                listed is suitable for you.
              </p>
            </Section>

            <Section heading="13. Limitation of liability">
              <p>
                Nothing in these Terms limits liability that cannot be
                excluded under English law (including for death or personal
                injury caused by negligence, or for fraud). Subject to
                that, GigGrab&rsquo;s total liability arising under or in
                connection with these Terms — whether in contract, tort
                (including negligence), or otherwise — is capped at the
                greater of (a) £100, or (b) the amounts paid by you to
                GigGrab in the 12 months before the event giving rise to
                the claim. We are not liable for indirect, incidental,
                consequential, special, or punitive damages, or for loss
                of profits, revenue, data, or goodwill.
              </p>
            </Section>

            <Section heading="14. Termination">
              <p>
                You may stop using the Service at any time and request
                account deletion via{" "}
                <a href="mailto:privacy@giggrab.io">privacy@giggrab.io</a>.
                We may suspend or terminate accounts for breach of these
                Terms or where required by law. Sections that should
                reasonably survive termination (ownership, disclaimers,
                liability, governing law) will continue to apply.
              </p>
            </Section>

            <Section heading="15. Changes">
              <p>
                We may update these Terms. Material changes are notified by
                email or prominent in-app notice at least 14 days before
                they take effect. Continued use of the Service after the
                effective date means you accept the updated Terms.
              </p>
            </Section>

            <Section heading="16. Governing law &amp; disputes">
              <p>
                These Terms are governed by the laws of England &amp; Wales.
                The courts of England &amp; Wales have exclusive
                jurisdiction over disputes, except that consumers in other
                UK nations may bring claims in the courts of their home
                nation. Nothing in these Terms affects your statutory
                rights as a consumer.
              </p>
            </Section>

            <Section heading="17. Contact">
              <p>
                Questions: <a href="mailto:hello@giggrab.io">hello@giggrab.io</a>.
                Privacy or data-rights requests:{" "}
                <a href="mailto:privacy@giggrab.io">privacy@giggrab.io</a>.
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
