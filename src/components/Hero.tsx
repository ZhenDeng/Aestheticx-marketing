import { Reveal } from "./Reveal";
import { BrandMark } from "./BrandMark";
import { APP_STORE_URL } from "@/lib/site";

const TEAM = [
  { label: "Prescribing doctors", tint: "bg-umber", soft: "text-umber", chip: "bg-umber-soft" },
  { label: "Injecting nurses", tint: "bg-rose", soft: "text-rose", chip: "bg-rose-soft" },
  { label: "Clinic management", tint: "bg-slate", soft: "text-slate", chip: "bg-slate-soft" },
];

export function Hero() {
  return (
    <section id="top" className="border-b border-line">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <Reveal>
            <p className="kicker">iOS · Australian aesthetic practices</p>
          </Reveal>

          <Reveal as="h1" delay={80}>
            <span className="mt-7 block font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-[430] leading-[1.05] tracking-[-0.02em] text-ink">
              One record for the whole
              <br />
              aesthetic <em className="font-[330] not-italic text-gold-deep italic">care team</em>
            </span>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-7 max-w-xl text-[1.05rem] leading-relaxed text-ink-soft">
              AestheticX brings prescribing doctors, injecting nurses, and clinic management
              teams onto one calm, precise platform — built to work together for optimal
              patient-care delivery.
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
                href="#features"
                className="rounded-btn border border-line bg-card px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-gold"
              >
                See what it does
              </a>
            </div>
          </Reveal>
        </div>

        {/* Brand visual — the three roles around one shared record. No names. */}
        <Reveal delay={200} className="justify-self-center">
          <div className="relative w-full max-w-sm">
            <div className="absolute -right-4 -top-6 hidden sm:block">
              <BrandMark size={72} />
            </div>

            <article className="overflow-hidden rounded-card border border-line bg-card p-7 shadow-phone">
              <p className="micro">One shared record</p>
              <h3 className="mt-2 font-display text-2xl text-ink">Optimal patient care</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Every role works from the same source of truth.
              </p>

              <ul className="mt-6 space-y-2.5">
                {TEAM.map((t) => (
                  <li
                    key={t.label}
                    className="flex items-center gap-3 rounded-inner border border-line-soft bg-paper/40 px-4 py-3"
                  >
                    <span className={`h-2.5 w-2.5 flex-none rounded-full ${t.tint}`} aria-hidden />
                    <span className="text-sm text-ink">{t.label}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${t.chip} ${t.soft}`}>
                      in sync
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <p className="mt-4 px-1 text-center font-mono text-[0.7rem] text-ink-faint">
              DOCTOR · NURSE · CLINIC — ONE WORKFLOW
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
