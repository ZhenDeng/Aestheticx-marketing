"use client";

import { useState, type CSSProperties } from "react";
import { ROLES, type RoleKey } from "@/lib/content";
import { Reveal } from "./Reveal";

const TINT: Record<RoleKey, { tint: string; soft: string }> = {
  rose: { tint: "var(--color-rose)", soft: "var(--color-rose-soft)" },
  sage: { tint: "var(--color-sage)", soft: "var(--color-sage-soft)" },
  slate: { tint: "var(--color-slate)", soft: "var(--color-slate-soft)" },
  umber: { tint: "var(--color-umber)", soft: "var(--color-umber-soft)" },
};

export function RoleTintShowcase() {
  const [active, setActive] = useState<RoleKey>("rose");
  const role = ROLES.find((r) => r.key === active) ?? ROLES[0];

  const tintStyle = {
    "--color-tint": TINT[active].tint,
    "--color-tint-soft": TINT[active].soft,
  } as CSSProperties;

  return (
    <section id="identity" className="scroll-mt-24 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <p className="kicker">The role-tint system</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4vw,3rem)] font-[430] leading-[1.08] tracking-[-0.015em] text-ink">
            Nobody ever charts under the wrong hat
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-ink-soft">
            Switch identity and the entire interface re-tints — rose for an independent nurse,
            sage at a clinic, slate for admin, umber for doctors. The change is always explicit,
            always animated. The tint cross-fade <em>is</em> the confirmation. Try it:
          </p>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          {/* Role selector */}
          <Reveal delay={120}>
            <div
              role="tablist"
              aria-label="Choose an identity"
              className="flex flex-col gap-2.5"
            >
              {ROLES.map((r) => {
                const selected = r.key === active;
                return (
                  <button
                    key={r.key}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActive(r.key)}
                    style={
                      {
                        "--color-tint": TINT[r.key].tint,
                        "--color-tint-soft": TINT[r.key].soft,
                      } as CSSProperties
                    }
                    className={`flex items-center gap-4 rounded-inner border bg-card px-5 py-4 text-left transition-all duration-300 ${
                      selected
                        ? "border-tint shadow-[0_0_0_3px_var(--color-tint-soft)]"
                        : "border-line hover:border-tint/50"
                    }`}
                  >
                    <span className="grid h-11 w-11 flex-none place-items-center rounded-field bg-tint font-display text-lg text-card">
                      {r.context
                        .replace(/@.*/, "")
                        .trim()
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{r.identity}</span>
                      <span className="block truncate text-sm text-ink-soft">{r.context}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Reveal>

          {/* Re-tinting mock */}
          <Reveal delay={200}>
            <div
              style={tintStyle}
              className="rounded-card border border-line bg-card p-6 shadow-card transition-colors duration-500 sm:p-8"
            >
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 transition-colors duration-500"
                  style={{ background: "var(--color-tint)" }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--color-tint-soft)" }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--color-tint-soft)" }}
                  >
                    {role.context}
                  </span>
                </span>
                <span className="micro">{role.badge}</span>
              </div>

              <div
                className="mt-6 rounded-inner p-5 transition-colors duration-500"
                style={{ background: "var(--color-tint-soft)" }}
              >
                <p className="micro !text-ink-soft">Now viewing as</p>
                <p
                  className="mt-1 font-display text-2xl transition-colors duration-500"
                  style={{ color: "var(--color-tint)" }}
                >
                  {role.identity}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{role.note}</p>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <span
                  className="flex-1 rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors duration-500"
                  style={{ background: "var(--color-tint)" }}
                >
                  Primary action
                </span>
                <span className="rounded-btn border border-line px-4 py-3 text-center text-sm text-ink-soft">
                  Secondary
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
