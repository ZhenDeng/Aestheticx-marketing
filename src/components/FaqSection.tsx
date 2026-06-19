import { FAQS } from "@/lib/content";
import { Reveal } from "./Reveal";

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-24 border-b border-line bg-paper-deep/40">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <p className="kicker">Questions</p>
          <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            Good to know
          </h2>
        </Reveal>

        <div className="mt-12 divide-y divide-line border-y border-line">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg text-ink marker:hidden">
                  {f.q}
                  <span
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-field border border-line text-ink-soft transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-[0.98rem] leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
