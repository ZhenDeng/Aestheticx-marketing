import Link from "next/link";
import { AUDIENCES, type RoleKey } from "@/lib/content";
import { Reveal } from "./Reveal";

const TINT_CLASS: Record<RoleKey, { bar: string; chip: string }> = {
  rose: { bar: "bg-rose", chip: "bg-rose-soft text-rose" },
  sage: { bar: "bg-sage", chip: "bg-sage-soft text-sage" },
  slate: { bar: "bg-slate", chip: "bg-slate-soft text-slate" },
  umber: { bar: "bg-umber", chip: "bg-umber-soft text-umber" },
};

export function WhoForSection() {
  return (
    <section id="who" className="scroll-mt-24 border-b border-line bg-paper-deep/40">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <p className="kicker">Who it&apos;s for</p>
          <h2 className="mt-5 max-w-2xl font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            One app, every seat in the practice
          </h2>
          <p className="mt-4 max-w-xl text-[1.02rem] leading-relaxed text-ink-soft">
            Each role gets its own view of the same record. Choose yours for a detailed walk-through.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.slug} delay={i * 100}>
              <Link
                href={`/for-${a.slug}`}
                className="group block h-full overflow-hidden rounded-card border border-line bg-card shadow-card transition-colors hover:border-gold"
              >
                <div className={`h-1.5 ${TINT_CLASS[a.key].bar}`} aria-hidden />
                <div className="p-7">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-[0.7rem] font-medium ${TINT_CLASS[a.key].chip}`}
                  >
                    {a.who}
                  </span>
                  <p className="mt-4 text-[0.98rem] leading-relaxed text-ink-soft">{a.line}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    Explore the {a.who.toLowerCase()} guide
                    <span className="transition-transform group-hover:translate-x-1" aria-hidden>
                      →
                    </span>
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
