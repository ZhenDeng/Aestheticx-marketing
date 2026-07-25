// heldIdentities nurse-employment derivation (spec: 2026-07-25). In demo mode (no claims),
// a nurse's granted clinic membership must surface as a clinic-context nurse identity so the
// profile switcher + invoice composer can offer the clinic — mirroring the live claim path.
import { describe, expect, it } from "vitest";
import { heldIdentities } from "../identity";
import type { ClinicEmployment, Identity } from "../types";

const indie: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "independent" } };
const employment: ClinicEmployment = { id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1 };

describe("heldIdentities — nurse clinic employment", () => {
  it("derives one clinic-context nurse identity for the active nurse's grant", () => {
    const held = heldIdentities(indie, [], [], [employment]);
    const clinic = held.filter((i) => i.role === "nurse" && i.context.kind === "clinic");
    expect(clinic).toHaveLength(1);
    expect(clinic[0].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } });
    // The independent identity is retained.
    expect(held.some((i) => i.context.kind === "independent")).toBe(true);
  });

  it("does not leak another nurse's grant", () => {
    const other: ClinicEmployment = { ...employment, id: "u-other_clinic-lumiere", nurseID: "u-other", nurseName: "Other" };
    const held = heldIdentities(indie, [], [], [other]);
    expect(held.some((i) => i.context.kind === "clinic")).toBe(false);
  });

  it("dedupes against an identity the account already holds", () => {
    const alreadyClinic: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } } };
    // available is empty → demo path; base identities come from the active set fallback.
    const held = heldIdentities(alreadyClinic, [], [], [employment]);
    const clinic = held.filter((i) => i.role === "nurse" && i.context.kind === "clinic" && i.context.clinic.id === "clinic-lumiere");
    expect(clinic).toHaveLength(1);
  });

  it("returns available unchanged in live mode (non-empty available)", () => {
    const held = heldIdentities(indie, [indie], [], [employment]);
    expect(held).toEqual([indie]);
  });
});
