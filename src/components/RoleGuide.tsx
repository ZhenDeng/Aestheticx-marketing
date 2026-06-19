import Link from "next/link";
import { ROLE_PAGES, ROLE_ORDER, type RoleSlug } from "@/lib/content";
import { Reveal } from "./Reveal";
import { RoleTintShowcase } from "./RoleTintShowcase";

const TINT_BAR: Record<string, string> = {
  rose: "bg-rose",
  sage: "bg-sage",
  slate: "bg-slate",
  umber: "bg-umber",
};

export function RoleGuide({ slug }: { slug: RoleSlug }) {
  const page = ROLE_PAGES[slug];
  const others = ROLE_ORDER.filter((s) => s !== slug).map((s) => ROLE_PAGES[s]);

  return (
    <>
      {/* Header */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-24">
          <Reveal>
            <p className="kicker">{page.eyebrow}</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-[430] leading-[1.06] tracking-[-0.02em] text-ink">
              {page.title}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-4 font-display text-xl italic text-gold-deep">{page.tagline}</p>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-ink-soft">
              {page.intro}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Identity demo, defaulted to this role */}
      <RoleTintShowcase initial={page.key} />

      {/* Detailed guide — subtitles */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 lg:py-24">
          <Reveal>
            <p className="kicker">How it works</p>
            <h2 className="mt-5 font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-[430] leading-[1.1] tracking-[-0.015em] text-ink">
              A walk through your day
            </h2>
          </Reveal>

          <div className="mt-12 space-y-px overflow-hidden rounded-card border border-line bg-line">
            {page.sections.map((s, i) => (
              <Reveal key={s.title} delay={Math.min(i, 4) * 60} className="bg-card p-7 sm:p-8">
                <div className="flex gap-5">
                  <span className="mt-1 font-mono text-sm text-gold-deep">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-xl text-ink">{s.title}</h3>
                    <p className="mt-2.5 text-[0.98rem] leading-relaxed text-ink-soft">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-links to the other roles */}
      <section className="border-b border-line bg-paper-deep/40">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
          <p className="kicker">Other roles</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/for-${o.slug}`}
                className="group flex items-center gap-4 rounded-card border border-line bg-card p-5 transition-colors hover:border-gold"
              >
                <span className={`h-10 w-1.5 flex-none rounded-full ${TINT_BAR[o.key]}`} aria-hidden />
                <span>
                  <span className="block font-display text-lg text-ink">{o.eyebrow}</span>
                  <span className="block text-sm text-ink-soft">{o.tagline}</span>
                </span>
                <span className="ml-auto text-ink-faint transition-transform group-hover:translate-x-1" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
