import { COMPLIANCE } from "@/lib/content";
import { Reveal } from "./Reveal";

export function ComplianceSection() {
  return (
    <section id="compliance" className="scroll-mt-24 border-b border-line bg-paper-deep/40">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <p className="kicker">Built for compliance</p>
            <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
              Precise where it has to be
            </h2>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-ink-soft">
              AestheticX handles medical records and legal consent, so the things that carry
              consequence — authorisations, signatures, legal clauses — are protected by design,
              not by convention.
            </p>
          </Reveal>

          <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
            {COMPLIANCE.map((item, i) => (
              <Reveal key={item.label} delay={i * 80} className="bg-card p-7">
                <h3 className="font-display text-xl text-ink">{item.label}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
