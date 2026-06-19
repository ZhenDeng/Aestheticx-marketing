import { HOME_POINTS } from "@/lib/content";
import { Reveal } from "./Reveal";

export function KeyPoints() {
  return (
    <section id="features" className="scroll-mt-24 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <p className="kicker">What it does</p>
          <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            One record, the whole care team
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {HOME_POINTS.map((point, i) => (
            <Reveal key={point.title} delay={(i % 3) * 80} className="bg-card p-7 lg:p-8">
              <span className="font-mono text-xs text-gold-deep">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 font-display text-xl leading-snug text-ink">{point.title}</h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">{point.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
