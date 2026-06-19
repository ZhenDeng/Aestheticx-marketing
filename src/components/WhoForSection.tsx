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
    <section id="who" className="scroll-mt-24 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <p className="kicker">Who it&apos;s for</p>
          <h2 className="mt-5 max-w-2xl font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            One app, every seat in the practice
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.key} delay={i * 100}>
              <div className="h-full overflow-hidden rounded-card border border-line bg-card shadow-card">
                <div className={`h-1.5 ${TINT_CLASS[a.key].bar}`} aria-hidden />
                <div className="p-7">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-[0.7rem] font-medium ${TINT_CLASS[a.key].chip}`}
                  >
                    {a.who}
                  </span>
                  <p className="mt-4 text-[0.98rem] leading-relaxed text-ink-soft">{a.line}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
