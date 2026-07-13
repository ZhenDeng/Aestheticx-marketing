import { describe, it, expect } from "vitest";
import { buildSeedState } from "../seed";
import { ownerDisplayLabel } from "../backend";
import type { DemoState } from "../types";

// Owner bug 3 (2026-07-13): the doctor's "Other patients" grouping labelled live owners
// with raw Firebase uids ("garbled text") because ownerLabel only knows the demo cast.
// ownerDisplayLabel resolves through hydrated state before falling back to a readable stub.

function liveish(over: Partial<DemoState>): DemoState {
  // Seed gives a fully-shaped state; the overrides emulate live-hydrated content.
  return { ...buildSeedState(), ...over };
}

describe("ownerDisplayLabel", () => {
  it("keeps demo-cast resolution (Lumière clinic, cast nurses)", () => {
    const state = buildSeedState();
    expect(ownerDisplayLabel(state, { kind: "clinic", id: "clinic-lumiere" })).toBe("Lumière Clinic");
    expect(ownerDisplayLabel(state, { kind: "nurse", id: "u-sarah" })).toBe("Sarah Chen");
  });

  it("resolves a nurse owner from the hydrated accounts inventory (super admin)", () => {
    const state = liveish({
      accountsByID: {
        "uid-live-nurse": { id: "uid-live-nurse", name: "Nadia Rossi", email: "n@x.com", roles: ["nurse"], mustChangePassword: false },
      },
    });
    expect(ownerDisplayLabel(state, { kind: "nurse", id: "uid-live-nurse" })).toBe("Nadia Rossi");
  });

  it("resolves nurse and clinic owners from cooperation relationships", () => {
    const rel = {
      id: "doc_nurse_uid-live-nurse",
      doctorID: "doc-1",
      doctorName: "Dr Live",
      counterpartyType: "nurse" as const,
      counterpartyID: "uid-live-nurse",
      counterpartyName: "Nadia Rossi",
      status: "active" as const,
      authRequestsAllowed: true,
      invoiceApplies: true,
      priceCentsOverride: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const clinicRel = { ...rel, id: "doc_clinic_c9", counterpartyType: "clinic" as const, counterpartyID: "c9", counterpartyName: "Harbour Aesthetics" };
    const state = liveish({ cooperationRelationshipsByID: { [rel.id]: rel, [clinicRel.id]: clinicRel } });
    expect(ownerDisplayLabel(state, { kind: "nurse", id: "uid-live-nurse" })).toBe("Nadia Rossi");
    expect(ownerDisplayLabel(state, { kind: "clinic", id: "c9" })).toBe("Harbour Aesthetics");
  });

  it("resolves a nurse owner from a hydrated request's nurse name", () => {
    const seeded = buildSeedState();
    const anyReq = Object.values(seeded.requests)[0];
    const state = liveish({
      requests: {
        r9: { ...anyReq, id: "r9", nurse: { id: "uid-live-nurse", name: "Nadia Rossi" } },
      },
    });
    expect(ownerDisplayLabel(state, { kind: "nurse", id: "uid-live-nurse" })).toBe("Nadia Rossi");
  });

  it("never shows a raw uid — unknown owners get a readable stub", () => {
    const state = buildSeedState();
    expect(ownerDisplayLabel(state, { kind: "nurse", id: "xK9dPq3RtYw2LmN8aB" })).toBe("Nurse xK9dPq");
    expect(ownerDisplayLabel(state, { kind: "clinic", id: "zZ81hGtWq4" })).toBe("Clinic zZ81hG");
  });
});
