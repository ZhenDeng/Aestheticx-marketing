import Image from "next/image";
import { Reveal } from "./Reveal";

// Real product screenshots, captured from the app's own UI (the interactive demo renders
// the same interface the iOS app ports from, on seeded sample data — no mockups).
const SHOTS = [
  {
    src: "/screenshots/calendar-day.png",
    alt: "AestheticX calendar day view showing colour-coded treatment appointments and an external-calendar busy band",
    title: "The day at a glance",
    body: "Treatments, authorisation consults, and synced external busy times, colour-coded and drag-editable.",
  },
  {
    src: "/screenshots/patient-file.png",
    alt: "AestheticX patient file showing a clinical alert banner, allergies, active authorisations with repeats, and the note stream",
    title: "The patient file",
    body: "Alerts, allergies, active authorisations with remaining repeats, notes, and consent history in one place.",
  },
  {
    src: "/screenshots/review-requests.png",
    alt: "AestheticX doctor review queue showing a pending authorisation request with approve and require-edit actions",
    title: "Authorisations, reviewed in seconds",
    body: "A nurse raises the request; the doctor approves or sends it back for edits — never a flat reject.",
  },
] as const;

export function ShowcaseSection() {
  return (
    <section id="showcase" className="scroll-mt-24 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <p className="kicker">See it in action</p>
          <h2 className="mt-5 max-w-2xl font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            The real interface, not a mockup
          </h2>
          <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-ink-soft">
            These are screenshots of AestheticX itself — the same workflow you can explore in
            the interactive demo, on sample data.
          </p>
        </Reveal>

        <div className="mt-12 flex flex-col gap-14">
          {SHOTS.map((shot, i) => (
            <Reveal key={shot.src} delay={i * 80}>
              <figure className="grid items-center gap-6 lg:grid-cols-[0.9fr_2.1fr] lg:gap-10">
                <figcaption className={i % 2 === 1 ? "lg:order-2" : undefined}>
                  <h3 className="font-display text-xl text-ink">{shot.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{shot.body}</p>
                </figcaption>
                <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
                  <Image
                    src={shot.src}
                    alt={shot.alt}
                    width={2880}
                    height={1760}
                    sizes="(min-width: 1024px) 60rem, 100vw"
                    className="h-auto w-full"
                  />
                </div>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
