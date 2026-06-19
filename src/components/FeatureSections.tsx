import type { ReactNode } from "react";
import { FEATURES } from "@/lib/content";
import { Reveal } from "./Reveal";

function FeatureMock({ id }: { id: string }) {
  switch (id) {
    case "authorisations":
      return (
        <div className="rounded-card border border-gold/40 bg-gradient-to-b from-gold-soft/40 to-card p-6 shadow-card">
          <p className="micro !text-gold-deep">Request · awaiting review</p>
          <p className="mt-2 font-medium text-ink">Sarah Chen → Dr. Okafor</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-soft">
            <li className="flex justify-between border-b border-line-soft pb-2">
              <span>Botulinum Toxin A</span>
              <span className="font-mono text-xs">Glabella</span>
            </li>
            <li className="flex justify-between border-b border-line-soft pb-2">
              <span>HA Filler</span>
              <span className="font-mono text-xs">Lips</span>
            </li>
          </ul>
          <p className="mt-4 font-mono text-[0.7rem] text-gold-deep">
            ON APPROVAL → 2 AUTHORISATIONS · 10 REPEATS · EXP +6 MO
          </p>
        </div>
      );
    case "records":
      return (
        <div className="rounded-card border border-line bg-card p-6 shadow-card">
          {[
            ["DOB", "14 / 03 / 1991"],
            ["PHONE", "0412 884 207"],
            ["ALLERGIES", "Penicillin", true],
            ["MEDS", "Nil regular"],
          ].map(([label, value, danger]) => (
            <div
              key={label as string}
              className="flex items-baseline gap-4 border-b border-dotted border-line py-2.5 last:border-0"
            >
              <span className="w-20 flex-none font-mono text-[0.65rem] uppercase tracking-wider text-ink-faint">
                {label}
              </span>
              <span className={danger ? "font-medium text-danger" : "text-sm text-ink"}>
                {value}
              </span>
            </div>
          ))}
        </div>
      );
    case "consent":
      return (
        <div className="rounded-card border border-line bg-card p-6 shadow-card">
          <p className="micro">Antiwrinkle consent</p>
          <div className="mt-4 space-y-3">
            {["Are you pregnant or breastfeeding?", "Any history of facial nerve issues?"].map(
              (q) => (
                <div key={q} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-soft">{q}</span>
                  <span className="flex gap-1.5">
                    <span className="rounded-full bg-ink px-2.5 py-1 text-[0.65rem] font-medium text-paper">
                      No
                    </span>
                    <span className="rounded-full border border-line px-2.5 py-1 text-[0.65rem] text-ink-faint">
                      Yes
                    </span>
                  </span>
                </div>
              ),
            )}
          </div>
          <div className="mt-5 rounded-inner border border-gold/50 bg-gold-soft/40 p-3">
            <p className="font-mono text-[0.7rem] text-gold-deep">
              § OFF-LABEL USE — acknowledged &amp; sealed
            </p>
          </div>
        </div>
      );
    case "appointments":
      return (
        <div className="rounded-card border border-line bg-card p-6 shadow-card">
          <p className="micro">Tuesday · 12 Nov</p>
          <div className="mt-4 space-y-2">
            {[
              ["09:00", "Auth slot · J. Reyes", "gold"],
              ["10:30", "Treatment · M. Wu", "sage"],
              ["13:00", "Awaiting confirmation", "line"],
            ].map(([time, label, tone]) => (
              <div key={time} className="flex items-center gap-3">
                <span className="w-12 flex-none font-mono text-xs text-ink-faint">{time}</span>
                <span
                  className={`flex-1 rounded-field px-3 py-2 text-sm ${
                    tone === "gold"
                      ? "bg-gold-soft/60 text-gold-deep"
                      : tone === "sage"
                        ? "bg-sage-soft text-sage"
                        : "border border-dashed border-line text-ink-faint"
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case "teleconsult":
      return (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="relative h-40 bg-gradient-to-br from-[#4D4338] to-[#262019]">
            <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 font-mono text-[0.65rem] text-paper backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" /> LIVE
            </span>
            <span className="absolute bottom-4 right-4 h-14 w-10 rounded-md border border-paper/30 bg-black/30" />
          </div>
          <div className="p-5">
            <p className="micro">Patient summary</p>
            <p className="mt-1.5 text-sm text-ink-soft">
              Active authorisations and allergies stay in view through the whole call.
            </p>
          </div>
        </div>
      );
    case "billing":
      return (
        <div className="rounded-card border border-line bg-card p-6 shadow-card">
          <p className="micro">Authorisations approved</p>
          <p className="mt-1 font-display text-5xl font-[430] text-ink">38/mo</p>
          <div className="mt-5 space-y-2.5">
            {[
              ["October", "32", "80%"],
              ["November", "38", "95%"],
            ].map(([month, count, w]) => (
              <div key={month} className="flex items-center gap-3">
                <span className="w-20 flex-none text-sm text-ink-soft">{month}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
                  <span className="block h-full bg-gold" style={{ width: w }} />
                </span>
                <span className="font-mono text-xs text-ink">{count}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "notes":
      return (
        <div className="rounded-card border border-line bg-card p-6 shadow-card">
          {[
            ["12 NOV", "Antiwrinkle — glabella", "TX", "gold"],
            ["28 OCT", "Aftercare sent", "SENT", "sage"],
            ["14 OCT", "Initial consult notes", "GEN", "line"],
          ].map(([date, title, tag, tone]) => (
            <div
              key={date}
              className="flex items-center gap-4 border-b border-line-soft py-3 last:border-0"
            >
              <span className="w-14 flex-none font-mono text-[0.65rem] text-ink-faint">{date}</span>
              <span className="flex-1 text-sm text-ink">{title}</span>
              <span
                className={`rounded px-2 py-0.5 font-mono text-[0.6rem] ${
                  tone === "gold"
                    ? "bg-gold-soft/60 text-gold-deep"
                    : tone === "sage"
                      ? "bg-sage-soft text-sage"
                      : "bg-paper-deep text-ink-faint"
                }`}
              >
                {tag}
              </span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function FeatureRow({
  tag,
  title,
  body,
  points,
  mock,
  flip,
}: {
  tag: string;
  title: string;
  body: string;
  points: string[];
  mock: ReactNode;
  flip: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={flip ? "lg:order-2" : undefined}>
        <p className="kicker">{tag}</p>
        <h3 className="mt-5 font-display text-[clamp(1.6rem,3vw,2.25rem)] font-[430] leading-[1.12] tracking-[-0.01em] text-ink">
          {title}
        </h3>
        <p className="mt-4 text-[1.02rem] leading-relaxed text-ink-soft">{body}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm text-ink">
              <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-gold" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={120} className={flip ? "lg:order-1" : undefined}>
        {mock}
      </Reveal>
    </div>
  );
}

export function FeatureSections() {
  return (
    <section id="features" className="scroll-mt-24 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <p className="kicker">What it does</p>
          <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            Every part of the practice, in one record
          </h2>
        </Reveal>

        <div className="mt-16 space-y-20 lg:space-y-28">
          {FEATURES.map((f, i) => (
            <FeatureRow
              key={f.id}
              tag={f.tag}
              title={f.title}
              body={f.body}
              points={f.points}
              mock={<FeatureMock id={f.id} />}
              flip={i % 2 === 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
