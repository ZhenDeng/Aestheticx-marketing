import { Reveal } from "./Reveal";
import { SealMark } from "./SealMark";
import { APP_STORE_URL } from "@/lib/site";

export function Hero() {
  return (
    <section id="top" className="border-b border-line">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <Reveal>
            <p className="kicker">iOS · Australian aesthetic practices</p>
          </Reveal>

          <Reveal as="h1" delay={80}>
            <span className="mt-7 block font-display text-[clamp(2.6rem,6vw,4.4rem)] font-[430] leading-[1.04] tracking-[-0.02em] text-ink">
              The clinical record your
              <br />
              aesthetic practice <em className="font-[330] not-italic text-gold-deep italic">deserves</em>
            </span>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-7 max-w-xl text-[1.05rem] leading-relaxed text-ink-soft">
              Patient records, consent forms, the nurse-to-doctor treatment-authorisation
              workflow, appointments, teleconsults, and authorisation-based billing — in one
              app that feels precise and trustworthy, and calm enough to use all day.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href={APP_STORE_URL}
                className="rounded-btn bg-ink px-6 py-3.5 text-sm font-medium text-paper transition-colors hover:bg-umber"
              >
                Get the app
              </a>
              <a
                href="#identity"
                className="rounded-btn border border-line bg-card px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-gold"
              >
                See how it works
              </a>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <dl className="mt-12 flex flex-wrap gap-x-12 gap-y-5">
              {[
                ["4 roles", "Nurse · Doctor · Admin · Super"],
                ["5 repeats", "6-month authorisation expiry"],
                ["7 forms", "History + 6 consents"],
              ].map(([big, small]) => (
                <div key={big}>
                  <dt className="font-mono text-sm text-ink">{big}</dt>
                  <dd className="micro mt-1">{small}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        {/* Authorisation card mock — the product's gold "consequence" grammar */}
        <Reveal delay={200} className="justify-self-center">
          <div className="relative w-full max-w-sm">
            <div className="absolute -right-4 -top-6 hidden sm:block">
              <SealMark size={72} />
            </div>

            {/* identity badge */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-rose px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-soft" />
              <span className="text-xs font-medium text-rose-soft">Sarah Chen · Independent</span>
            </div>

            <article className="overflow-hidden rounded-card border border-line bg-card shadow-phone">
              <div className="flex">
                <div className="w-1.5 bg-gold" aria-hidden />
                <div className="flex-1 p-6">
                  <p className="micro">Active authorisation</p>
                  <h3 className="mt-2 font-display text-2xl text-ink">Botulinum Toxin A</h3>
                  <p className="mt-1 text-sm text-ink-soft">Glabella · 20 units</p>

                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5" aria-label="3 of 5 repeats remaining">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                      <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                      <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                      <span className="h-2.5 w-2.5 rounded-full bg-line" />
                      <span className="h-2.5 w-2.5 rounded-full bg-line" />
                    </div>
                    <span className="font-mono text-xs text-ink-faint">3 / 5 repeats</span>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-line-soft pt-4">
                    <span className="font-mono text-xs text-danger">EXPIRES 14 DEC</span>
                    <span className="font-mono text-xs text-ink-soft">Dr. E. Okafor</span>
                  </div>
                </div>
              </div>
            </article>

            <p className="mt-4 px-1 text-center font-mono text-[0.7rem] text-ink-faint">
              SAVING A TREATMENT NOTE CONSUMES ONE REPEAT
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
