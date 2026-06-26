import { describe, it, expect } from "vitest";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { searchPatients, pendingRequestsForDoctor, activeAuthorisations } from "@/lib/demo/backend";

describe("demo accounts", () => {
  it("includes the four primary roles", () => {
    const labels = DEMO_ACCOUNTS.map((a) => a.label);
    expect(labels).toContain("Sarah Chen — Nurse");
    expect(labels).toContain("Dr Elena Voss — Doctor");
    expect(labels).toContain("Ava Lim — Clinic Admin");
  });
});

describe("buildSeedState", () => {
  it("seeds three patients visible across the demo", () => {
    const state = buildSeedState();
    const names = Object.values(state.patients).map((p) => `${p.givenName} ${p.lastName}`).sort();
    expect(names).toEqual(["Amara Boyd", "Claire Donovan", "Grace Huang"]);
  });

  it("leaves Claire Donovan's Profhilo request pending for Dr Voss", () => {
    const state = buildSeedState();
    const pending = pendingRequestsForDoctor(state, "u-voss");
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending.some((r) => r.items.some((i) => i.name === "Profhilo"))).toBe(true);
  });

  it("gives Amara an active authorisation with a consumed repeat", () => {
    const state = buildSeedState();
    const amara = Object.values(state.patients).find((p) => p.givenName === "Amara")!;
    const active = activeAuthorisations(state, amara.id, SEED_NOW);
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active.some((a) => a.repeatsRemaining === 4)).toBe(true);
  });

  it("flags Amara's lignocaine alert", () => {
    const state = buildSeedState();
    const amara = Object.values(state.patients).find((p) => p.givenName === "Amara")!;
    expect(amara.alert).toMatch(/lignocaine/i);
  });
});
