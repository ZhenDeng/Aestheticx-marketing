import { describe, it, expect } from "vitest";
import { billingSummary, partyLabel, monthKey, monthLabel, customTimeframeCount, clinicBusinessStats } from "@/lib/demo/billing";
import type { Authorisation, Identity, MedicationItem, RepeatUsage } from "@/lib/demo/types";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

const doctor: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const nurseIndep: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const clinicAdmin: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };
const nurseClinic: Identity = { user: { id: "u-mia", name: "Mia Torres" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

const med: MedicationItem = { name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: [] };
function auth(over: Partial<Authorisation>): Authorisation {
  return {
    id: "a", requestID: "r", patientID: "p", doctorID: "u-voss", nurseID: "u-sarah", clinicID: LUMIERE.id,
    medication: med, repeatsRemaining: 5, expiresAt: 0, createdAt: Date.UTC(2026, 5, 26), invoiced: false, ...over,
  };
}

describe("billingSummary (authorisation-based)", () => {
  it("a doctor sees un-invoiced auths grouped by counterparty", () => {
    const s = billingSummary([auth({ id: "a1" }), auth({ id: "a2" })], doctor);
    expect(s.totalCount).toBe(2);
    expect(s.months[0].monthKey).toBe("2026-06");
    expect(s.months[0].byParty).toEqual([{ id: LUMIERE.id, type: "clinic", count: 2 }]);
  });
  it("excludes invoiced authorisations", () => {
    const s = billingSummary([auth({ id: "a1", invoiced: true }), auth({ id: "a2" })], doctor);
    expect(s.totalCount).toBe(1);
  });
  it("a clinic admin groups by the doctor", () => {
    const s = billingSummary([auth({ id: "a1" })], clinicAdmin);
    expect(s.months[0].byParty).toEqual([{ id: "u-voss", type: "doctor", count: 1 }]);
  });
  it("an independent nurse sees clinic-billed auths as not theirs", () => {
    const s = billingSummary([auth({ id: "a1" })], nurseIndep);
    expect(s.totalCount).toBe(0);
  });
  it("an independent nurse sees nurse-counterparty auths (no clinic)", () => {
    const s = billingSummary([auth({ id: "a1", clinicID: null })], nurseIndep);
    expect(s.totalCount).toBe(1);
    expect(s.months[0].byParty).toEqual([{ id: "u-voss", type: "doctor", count: 1 }]);
  });
});

describe("partyLabel", () => {
  it("resolves clinic + user ids, falling back to the id", () => {
    expect(partyLabel("clinic", LUMIERE.id, DEMO_ACCOUNTS, LUMIERE)).toBe("Lumière Clinic");
    expect(partyLabel("doctor", "u-voss", DEMO_ACCOUNTS, LUMIERE)).toBe("Dr Elena Voss");
    expect(partyLabel("nurse", "u-unknown", DEMO_ACCOUNTS, LUMIERE)).toBe("u-unknown");
  });
});

// Port of BillingLedger.count(forDoctor:/forCounterparty:from:to:) as BillingView's
// "Custom timeframe" Compute uses it (BillingView.swift:64-68) — inclusive bounds,
// identity-scoped, and (unlike billingSummary) counts invoiced authorisations too,
// because the iOS ledger is append-only.
describe("customTimeframeCount", () => {
  const jun1 = Date.UTC(2026, 5, 1);
  const jun30end = Date.UTC(2026, 5, 30, 23, 59, 59, 999);

  it("a doctor counts their authorisations inside the range, boundaries inclusive", () => {
    const auths = [
      auth({ id: "a1", createdAt: jun1 }),                        // exactly at from
      auth({ id: "a2", createdAt: jun30end }),                    // exactly at to
      auth({ id: "a3", createdAt: jun1 - 1 }),                    // just before from
      auth({ id: "a4", createdAt: jun30end + 1 }),                // just after to
    ];
    expect(customTimeframeCount(auths, doctor, jun1, jun30end)).toBe(2);
  });
  it("counts invoiced authorisations (the ledger is append-only)", () => {
    const auths = [auth({ id: "a1", invoiced: true }), auth({ id: "a2" })];
    expect(customTimeframeCount(auths, doctor, jun1, jun30end)).toBe(2);
  });
  it("a doctor never counts another doctor's authorisations", () => {
    const auths = [auth({ id: "a1", doctorID: "u-other" })];
    expect(customTimeframeCount(auths, doctor, jun1, jun30end)).toBe(0);
  });
  it("clinic-context identities count authorisations billed to their clinic", () => {
    const auths = [
      auth({ id: "a1" }),                                          // billed to Lumière
      auth({ id: "a2", nurseID: "u-other-nurse" }),                // still the clinic's
      auth({ id: "a3", clinicID: "c-other" }),                     // another clinic
      auth({ id: "a4", clinicID: null }),                          // independent nurse's
    ];
    expect(customTimeframeCount(auths, clinicAdmin, jun1, jun30end)).toBe(2);
    expect(customTimeframeCount(auths, nurseClinic, jun1, jun30end)).toBe(2);
  });
  it("an independent nurse counts only their own nurse-billed authorisations", () => {
    const auths = [
      auth({ id: "a1", clinicID: null }),                          // billed to u-sarah
      auth({ id: "a2", clinicID: null, nurseID: "u-other" }),
      auth({ id: "a3" }),                                          // clinic-billed
    ];
    expect(customTimeframeCount(auths, nurseIndep, jun1, jun30end)).toBe(1);
  });
});

// Port of ClinicStatistics.compute (Billing.swift:160-168) with ClinicStatsView's
// gating (BillingView.swift:237-238): clinic admins only; authorisations approved come
// from the ledger count for the clinic counterparty, patients served is the distinct
// patients among the clinic's in-range repeat usages, repeats used is their count.
describe("clinicBusinessStats", () => {
  const jun1 = Date.UTC(2026, 5, 1);
  const jun30end = Date.UTC(2026, 5, 30, 23, 59, 59, 999);
  function usage(over: Partial<RepeatUsage>): RepeatUsage {
    return { authorisationID: "a", patientID: "p1", clinicID: LUMIERE.id, nurseID: "u-mia", date: Date.UTC(2026, 5, 10), ...over };
  }

  it("computes approvals, distinct patients served and repeats used over the range", () => {
    const auths = [auth({ id: "a1" }), auth({ id: "a2" }), auth({ id: "a3", clinicID: null })];
    const usages = [
      usage({ patientID: "p1" }),
      usage({ patientID: "p1" }),  // same patient, second repeat
      usage({ patientID: "p2" }),
    ];
    expect(clinicBusinessStats(auths, usages, clinicAdmin, jun1, jun30end))
      .toEqual({ authorisationsApproved: 2, patientsServed: 2, repeatsUsed: 3 });
  });
  it("usage date boundaries are inclusive; out-of-range and foreign usages drop", () => {
    const usages = [
      usage({ patientID: "p1", date: jun1 }),
      usage({ patientID: "p2", date: jun30end }),
      usage({ patientID: "p3", date: jun1 - 1 }),
      usage({ patientID: "p4", date: jun30end + 1 }),
      usage({ patientID: "p5", clinicID: "c-other" }),
      usage({ patientID: "p6", clinicID: null }),
    ];
    expect(clinicBusinessStats([], usages, clinicAdmin, jun1, jun30end))
      .toEqual({ authorisationsApproved: 0, patientsServed: 2, repeatsUsed: 2 });
  });
  it("counts invoiced authorisations in approvals (ledger semantics)", () => {
    const auths = [auth({ id: "a1", invoiced: true })];
    expect(clinicBusinessStats(auths, [], clinicAdmin, jun1, jun30end)?.authorisationsApproved).toBe(1);
  });
  it("is denied to everyone but clinic admins (employee nurses included)", () => {
    expect(clinicBusinessStats([], [], nurseClinic, jun1, jun30end)).toBeNull();
    expect(clinicBusinessStats([], [], nurseIndep, jun1, jun30end)).toBeNull();
    expect(clinicBusinessStats([], [], doctor, jun1, jun30end)).toBeNull();
  });
});

describe("monthKey / monthLabel", () => {
  it("formats UTC month key and a human label", () => {
    expect(monthKey(Date.UTC(2026, 5, 26))).toBe("2026-06");
    expect(monthLabel("2026-06")).toBe("June 2026");
    expect(monthLabel("bogus")).toBe("bogus");
  });
});
