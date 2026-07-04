import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CONTACT_EMAIL, PRODUCT_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How AestheticX handles personal information — on this website, in the interactive demo, and in the app used by Australian aesthetic-medicine practices.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "4 July 2026";

export default function Privacy() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:py-28">
          <p className="kicker">Privacy</p>
          <h1 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            Privacy policy
          </h1>
          <p className="mt-3 text-sm text-ink-soft">Last updated {UPDATED}</p>

          <div className="mt-10 space-y-10 text-[1.02rem] leading-relaxed text-ink-soft [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
            <section>
              <h2>Who we are</h2>
              <p>
                {PRODUCT_NAME} is practice software for Australian aesthetic medicine. This
                policy covers three things separately: this marketing website, the interactive
                demo hosted on it, and the {PRODUCT_NAME} app that practices use with real
                patients. We handle personal information in accordance with the Privacy Act
                1988 (Cth) and the Australian Privacy Principles (APPs).
              </p>
            </section>

            <section>
              <h2>This website</h2>
              <p>
                Browsing this site requires no account and collects no personal information
                from you directly. We use Vercel Web Analytics to understand aggregate page
                traffic; it does not use cookies and does not identify individual visitors.
                The site is hosted by Vercel, whose infrastructure logs standard request
                metadata (such as IP address and user agent) to serve and secure the site.
              </p>
            </section>

            <section>
              <h2>The interactive demo</h2>
              <p>
                The demo behind the &ldquo;Log in&rdquo; link uses fictional sample data only —
                the same seeded records the app ships with for evaluation. Demo activity runs
                in your browser&rsquo;s memory and is discarded when you reload or leave the
                page. Nothing you type into the demo is stored by us. Please do not enter real
                patient information into the demo.
              </p>
            </section>

            <section>
              <h2>The {PRODUCT_NAME} app</h2>
              <p>
                Practices use {PRODUCT_NAME} to hold patient records, clinical notes,
                photographs, signed consent forms, appointments, and treatment authorisations.
                This is health information — sensitive information under the Privacy Act — and
                the practice that treats the patient remains the custodian of those records.
                {" "}{PRODUCT_NAME} processes it on the practice&rsquo;s behalf to provide the
                service.
              </p>
              <ul>
                <li>
                  Signing in on this site with a practice account connects to the same
                  production service as the iOS app, under the practice&rsquo;s agreement with
                  us — the demo pages above never do.
                </li>
                <li>
                  Data is stored with Google Firebase (Cloud Firestore, Cloud Storage, and
                  Firebase Authentication), encrypted in transit and at rest, with role-based
                  access controls so records are visible only to the treating practice&rsquo;s
                  authorised users.
                </li>
                <li>
                  Emails the practice asks us to send (such as aftercare instructions or
                  consent-form links) are delivered to the address the practice supplies.
                </li>
                <li>
                  Optional integrations a clinician links themselves (such as Google Calendar
                  sync) exchange only the data needed for that feature — busy times and
                  confirmed-appointment details — and can be unlinked at any time.
                </li>
                <li>
                  Video consults are carried over LiveKit; calls are transported for the
                  session and are not recorded by {PRODUCT_NAME}.
                </li>
              </ul>
            </section>

            <section>
              <h2>Access, correction, and deletion</h2>
              <p>
                Requests about patient records should be made to the treating practice, which
                controls them; we support practices in meeting their access, correction, and
                deletion obligations. For anything about this website or your dealings with us
                directly, contact us at the address below.
              </p>
            </section>

            <section>
              <h2>Contact</h2>
              <p>
                Questions or complaints about privacy:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                  {CONTACT_EMAIL}
                </a>
                . If you are not satisfied with our response, you may complain to the Office of
                the Australian Information Commissioner (oaic.gov.au).
              </p>
            </section>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
