import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CONTACT_EMAIL, PRODUCT_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The terms that govern this AestheticX website and its interactive demo.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "4 July 2026";

export default function Terms() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:py-28">
          <p className="kicker">Terms</p>
          <h1 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            Terms of use
          </h1>
          <p className="mt-3 text-sm text-ink-soft">Last updated {UPDATED}</p>

          <div className="mt-10 space-y-10 text-[1.02rem] leading-relaxed text-ink-soft [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
            <section>
              <h2>These terms</h2>
              <p>
                These terms govern your use of this website and the interactive demo it hosts.
                By using the site you accept them. Use of the {PRODUCT_NAME} app and service by
                a practice is governed by that practice&rsquo;s separate agreement with us, not
                by this page.
              </p>
            </section>

            <section>
              <h2>Not medical or legal advice</h2>
              <p>
                {PRODUCT_NAME} is practice software. Content on this site describes the
                software&rsquo;s workflow and is general information only — it is not medical,
                clinical, or legal advice, and it does not replace a clinician&rsquo;s
                judgement or a practice&rsquo;s own compliance obligations (including AHPRA and
                TGA requirements).
              </p>
            </section>

            <section>
              <h2>The demo</h2>
              <p>
                The demo is provided so you can evaluate the product with fictional sample
                data. You agree not to enter real patient information into it, not to attempt
                to gain access to accounts or data that are not yours, and not to use the demo
                or site to probe, disrupt, or reverse-engineer the service.
              </p>
            </section>

            <section>
              <h2>Intellectual property</h2>
              <p>
                The {PRODUCT_NAME} name, brand, design, and the content of this site are ours
                or licensed to us. You may not reproduce them except as needed to view the site
                or as permitted by law.
              </p>
            </section>

            <section>
              <h2>Liability</h2>
              <p>
                The site and demo are provided &ldquo;as is&rdquo; for evaluation. To the
                extent permitted by law — and without excluding guarantees under the Australian
                Consumer Law that cannot be excluded — we are not liable for loss arising from
                reliance on this site or the demo. Nothing on this page limits the terms of a
                practice&rsquo;s service agreement.
              </p>
            </section>

            <section>
              <h2>Changes and law</h2>
              <p>
                We may update this site and these terms; the date above reflects the latest
                revision. These terms are governed by the laws of Australia.
              </p>
            </section>

            <section>
              <h2>Contact</h2>
              <p>
                Questions about these terms:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
