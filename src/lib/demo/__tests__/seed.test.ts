import { describe, it, expect } from "vitest";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { pendingRequestsForDoctor, activeAuthorisations, createServiceInvoice } from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

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

  // Regression: buildSeedState assembles accountsByID (clinicIDs from baked identity contexts)
  // and clinicEmployments (admin-granted membership) separately — nothing synced the two, so a
  // grant-only nurse like Nadia (no baked clinic identity) seeded with an EMPTY clinicIDs despite
  // holding a clinicEmployments grant. The admin Employment view and createServiceInvoice both
  // key off clinicIDs, not clinicEmployments directly, so this silently locked her out.
  it("folds Nadia's seeded clinic-employment grant into her account's clinicIDs", () => {
    const state = buildSeedState();
    expect(state.accountsByID["u-nadia"]?.clinicIDs).toContain("clinic-lumiere");
  });

  it("keeps every seeded clinicEmployments grant reflected in its nurse's clinicIDs (general invariant)", () => {
    const state = buildSeedState();
    for (const employment of state.clinicEmployments) {
      const account = state.accountsByID[employment.nurseID];
      expect(account?.clinicIDs).toContain(employment.clinicID);
    }
  });

  it("lets Nadia invoice Lumière out of the box, from her seeded grant alone", () => {
    const state = buildSeedState();
    const before = state.invoices.length;
    const nadiaIndependent: Identity = { user: { id: "u-nadia", name: "Nadia Okafor" }, role: "nurse", context: { kind: "independent" } };
    const result = createServiceInvoice(
      state,
      { clinicID: "clinic-lumiere", lines: [{ description: "June nursing", amountCents: 100000 }] },
      nadiaIndependent,
      SEED_NOW,
    );
    expect(result.invoices).toHaveLength(before + 1);
    expect(result.invoices[result.invoices.length - 1].counterpartyID).toBe("clinic-lumiere");
  });
});
