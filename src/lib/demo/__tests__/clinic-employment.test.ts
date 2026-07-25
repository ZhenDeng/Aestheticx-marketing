// Nurse clinic employment (spec: 2026-07-25 nurse-clinic-employment). A super admin
// employs a nurse at a clinic; the grant folds into the nurse's clinicIDs, which unlocks
// the Employment view + createServiceInvoice. Modelled as membership, not a cooperation rel.
import { describe, expect, it } from "vitest";
import {
  BackendError,
  emptyState,
  setClinicEmployment,
  clinicEmploymentsList,
  createServiceInvoice,
} from "../backend";
import type { DemoState, Identity } from "../types";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
const indieNurse: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "independent" } };

// A nurse who is NOT yet a member of the clinic (the seed cast's nurses all are).
function stateWithNonMemberNurse(): DemoState {
  return {
    ...emptyState(),
    accountsByID: {
      "u-indie": { id: "u-indie", name: "Indie Nurse", email: "", roles: ["nurse"], clinicIDs: [], mustChangePassword: false },
      "u-doc": { id: "u-doc", name: "Dr Who", email: "", roles: ["doctor"], clinicIDs: [], mustChangePassword: false },
    },
    clinicsByID: { "clinic-lumiere": { id: "clinic-lumiere", name: "Lumière Clinic" } },
  };
}

const grant = { nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic" };

describe("setClinicEmployment", () => {
  it("grants: folds the clinic into the nurse's clinicIDs, records the employment + audit", () => {
    const next = setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, admin, 1000);
    expect(next.accountsByID["u-indie"].clinicIDs).toEqual(["clinic-lumiere"]);
    expect(clinicEmploymentsList(next)).toEqual([
      { id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1000 },
    ]);
    const audit = Object.values(next.auditLogByID).find((e) => e.action === "clinic_employment_granted");
    expect(audit?.targetID).toBe("u-indie");
  });

  it("revokes: removes the clinic from clinicIDs and drops the employment + audit", () => {
    const granted = setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, admin, 1000);
    const revoked = setClinicEmployment(granted, { ...grant, employed: false }, admin, 2000);
    expect(revoked.accountsByID["u-indie"].clinicIDs).toEqual([]);
    expect(clinicEmploymentsList(revoked)).toEqual([]);
    expect(Object.values(revoked.auditLogByID).some((e) => e.action === "clinic_employment_revoked")).toBe(true);
  });

  it("is idempotent on repeat grant — one record, one clinicID entry", () => {
    const once = setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, admin, 1000);
    const twice = setClinicEmployment(once, { ...grant, employed: true }, admin, 1500);
    expect(twice.accountsByID["u-indie"].clinicIDs).toEqual(["clinic-lumiere"]);
    expect(clinicEmploymentsList(twice)).toHaveLength(1);
  });

  it("rejects a non-superAdmin actor", () => {
    expect(() => setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, indieNurse, 1000))
      .toThrow(BackendError);
  });

  it("rejects a non-nurse target", () => {
    expect(() => setClinicEmployment(stateWithNonMemberNurse(), { nurseID: "u-doc", nurseName: "Dr Who", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", employed: true }, admin, 1000))
      .toThrow(BackendError);
  });

  it("rejects a missing clinic", () => {
    expect(() => setClinicEmployment(stateWithNonMemberNurse(), { ...grant, clinicID: "clinic-ghost", employed: true }, admin, 1000))
      .toThrow(BackendError);
  });

  it("revoking a pair that was never granted returns state unchanged (no clinicIDs strip, no audit)", () => {
    const before = stateWithNonMemberNurse();
    const after = setClinicEmployment(before, { ...grant, employed: false }, admin, 1000);
    expect(after).toBe(before);
    expect(after.accountsByID["u-indie"].clinicIDs).toEqual([]);
    expect(Object.values(after.auditLogByID).some((e) => e.action === "clinic_employment_revoked")).toBe(false);
  });

  it("unlocks invoicing: the nurse can only createServiceInvoice after being employed", () => {
    const before = stateWithNonMemberNurse();
    expect(() => createServiceInvoice(before, { clinicID: "clinic-lumiere", lines: [{ description: "June nursing", amountCents: 100000 }] }, indieNurse, 1000))
      .toThrow(BackendError);
    const after = setClinicEmployment(before, { ...grant, employed: true }, admin, 1000);
    const invoiced = createServiceInvoice(after, { clinicID: "clinic-lumiere", lines: [{ description: "June nursing", amountCents: 100000 }] }, indieNurse, 2000);
    expect(invoiced.invoices).toHaveLength(1);
    expect(invoiced.invoices[0].counterpartyID).toBe("clinic-lumiere");
  });
});
