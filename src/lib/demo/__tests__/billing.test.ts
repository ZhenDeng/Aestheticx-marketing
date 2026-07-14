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

describe("billingSummary (per approved request — the billingEvents grain)", () => {
  it("a doctor sees approvals grouped by counterparty, one per request", () => {
    const s = billingSummary([auth({ id: "a1", requestID: "r1" }), auth({ id: "a2", requestID: "r2" })], doctor);
    expect(s.totalCount).toBe(2);
    expect(s.months[0].monthKey).toBe("2026-06");
    expect(s.months[0].byParty).toEqual([{ id: LUMIERE.id, type: "clinic", count: 2 }]);
  });
  it("a multi-item request counts once (one BillingEvent per approved request)", () => {
    // Three medication items from one approval share the requestID — iOS's ledger
    // and the backend's billingEvents doc both record a single event for them.
    const s = billingSummary(
      [auth({ id: "r1-0", requestID: "r1" }), auth({ id: "r1-1", requestID: "r1" }), auth({ id: "r1-2", requestID: "r1" })],
      doctor,
    );
    expect(s.totalCount).toBe(1);
    expect(s.months[0].byParty).toEqual([{ id: LUMIERE.id, type: "clinic", count: 1 }]);
  });
  it("still counts invoiced approvals (the ledger is append-only; invoicing flags line items only)", () => {
    const s = billingSummary([auth({ id: "a1", requestID: "r1", invoiced: true }), auth({ id: "a2", requestID: "r2" })], doctor);
    expect(s.totalCount).toBe(2);
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

  it("a doctor counts their approvals inside the range, boundaries inclusive", () => {
    const auths = [
      auth({ id: "a1", requestID: "r1", createdAt: jun1 }),       // exactly at from
      auth({ id: "a2", requestID: "r2", createdAt: jun30end }),   // exactly at to
      auth({ id: "a3", requestID: "r3", createdAt: jun1 - 1 }),   // just before from
      auth({ id: "a4", requestID: "r4", createdAt: jun30end + 1 }), // just after to
    ];
    expect(customTimeframeCount(auths, doctor, jun1, jun30end)).toBe(2);
  });
  it("a multi-item request counts once (billingEvents grain)", () => {
    const auths = [auth({ id: "r1-0", requestID: "r1" }), auth({ id: "r1-1", requestID: "r1" })];
    expect(customTimeframeCount(auths, doctor, jun1, jun30end)).toBe(1);
  });
  it("counts invoiced approvals (the ledger is append-only)", () => {
    const auths = [auth({ id: "a1", requestID: "r1", invoiced: true }), auth({ id: "a2", requestID: "r2" })];
    expect(customTimeframeCount(auths, doctor, jun1, jun30end)).toBe(2);
  });
  it("a doctor never counts another doctor's authorisations", () => {
    const auths = [auth({ id: "a1", doctorID: "u-other" })];
    expect(customTimeframeCount(auths, doctor, jun1, jun30end)).toBe(0);
  });
  it("clinic-context identities count approvals billed to their clinic", () => {
    const auths = [
      auth({ id: "a1", requestID: "r1" }),                         // billed to Lumière
      auth({ id: "a2", requestID: "r2", nurseID: "u-other-nurse" }), // still the clinic's
      auth({ id: "a3", requestID: "r3", clinicID: "c-other" }),    // another clinic
      auth({ id: "a4", requestID: "r4", clinicID: null }),         // independent nurse's
    ];
    expect(customTimeframeCount(auths, clinicAdmin, jun1, jun30end)).toBe(2);
    expect(customTimeframeCount(auths, nurseClinic, jun1, jun30end)).toBe(2);
  });
  it("an independent nurse counts only their own nurse-billed approvals", () => {
    const auths = [
      auth({ id: "a1", requestID: "r1", clinicID: null }),         // billed to u-sarah
      auth({ id: "a2", requestID: "r2", clinicID: null, nurseID: "u-other" }),
      auth({ id: "a3", requestID: "r3" }),                         // clinic-billed
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
    const auths = [
      auth({ id: "a1", requestID: "r1" }),
      auth({ id: "a2", requestID: "r2" }),
      auth({ id: "a3", requestID: "r3", clinicID: null }),
    ];
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

// 14/07 feedback: dashboard headline + Invoice-section drilldown.
import { approvedThisMonth } from "@/lib/demo/billing";
import { counterpartyMonthDetail, emptyState } from "@/lib/demo/backend";
import type { DemoState } from "@/lib/demo/types";

describe("approvedThisMonth (dashboard headline)", () => {
  const JUNE = Date.UTC(2026, 5, 26);
  it("counts only the current calendar month, per approved request", () => {
    const auths = [
      auth({ id: "r1-0", requestID: "r1", createdAt: JUNE }),
      auth({ id: "r1-1", requestID: "r1", createdAt: JUNE }), // same request — one event
      auth({ id: "r2-0", requestID: "r2", createdAt: Date.UTC(2026, 4, 30) }), // May — out
    ];
    expect(approvedThisMonth(auths, doctor, JUNE)).toBe(1);
    expect(approvedThisMonth(auths, clinicAdmin, JUNE)).toBe(1);
    expect(approvedThisMonth(auths, nurseIndep, JUNE)).toBe(0); // clinic-billed, not theirs
    expect(approvedThisMonth([], doctor, JUNE)).toBe(0);
  });
});

describe("counterpartyMonthDetail (Invoice-section drilldown)", () => {
  const JUNE_1 = Date.UTC(2026, 5, 1);
  const JUNE_20 = Date.UTC(2026, 5, 20);
  function stateWith(auths: ReturnType<typeof auth>[]): DemoState {
    const s = emptyState();
    return {
      ...s,
      authorisations: Object.fromEntries(auths.map((a) => [a.id, a])),
      patients: {
        p: {
          id: "p", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1991, month: 3, day: 12 },
          gender: "F", address: "", phone: "", email: "", allergies: "", currentMedications: "",
          owner: { kind: "clinic", id: LUMIERE.id }, prescribingDoctorIDs: [],
        },
      },
    };
  }

  it("groups a multi-item request into ONE row with an items summary, most recent first", () => {
    const s = stateWith([
      auth({ id: "r1-0", requestID: "r1", createdAt: JUNE_1 }),
      auth({ id: "r1-1", requestID: "r1", createdAt: JUNE_1, medication: { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: [] } }),
      auth({ id: "r2-0", requestID: "r2", createdAt: JUNE_20 }),
    ]);
    const rows = counterpartyMonthDetail(s, "u-voss", "clinic", LUMIERE.id, "2026-06");
    expect(rows.map((r) => r.requestID)).toEqual(["r2", "r1"]); // desc by date
    expect(rows[1].detail).toBe("Profhilo 2 mls · Botox 20 U");
    expect(rows[0].patientName).toBe("Amara Boyd");
    expect(rows[0].dateISO).toBe("2026-06-20");
  });

  it("filters by month, doctor and counterparty; flags fully-invoiced requests", () => {
    const s = stateWith([
      auth({ id: "r1-0", requestID: "r1", createdAt: JUNE_1, invoiced: true }),
      auth({ id: "r3-0", requestID: "r3", createdAt: Date.UTC(2026, 4, 1) }),           // May
      auth({ id: "r4-0", requestID: "r4", createdAt: JUNE_1, doctorID: "u-else" }),     // other doctor
      auth({ id: "r5-0", requestID: "r5", createdAt: JUNE_1, clinicID: null }),         // nurse counterparty
    ]);
    const rows = counterpartyMonthDetail(s, "u-voss", "clinic", LUMIERE.id, "2026-06");
    expect(rows.map((r) => r.requestID)).toEqual(["r1"]);
    expect(rows[0].invoiced).toBe(true);
    expect(counterpartyMonthDetail(s, "u-voss", "nurse", "u-sarah", "2026-06").map((r) => r.requestID)).toEqual(["r5"]);
  });

  it("falls back to the request's patient snapshot for a deleted patient", () => {
    const s = stateWith([auth({ id: "r9-0", requestID: "r9", createdAt: JUNE_1, patientID: "gone" })]);
    const withSnapshot: DemoState = {
      ...s,
      requests: {
        r9: {
          id: "r9", patientID: "gone", nurse: { id: "u-sarah", name: "Sarah Chen" }, doctorID: "u-voss",
          context: { kind: "clinic", clinic: LUMIERE }, items: [], status: "approved", createdAt: JUNE_1,
          patientSummary: { fullName: "Grace Huang", dateOfBirth: { year: 1979, month: 1, day: 17 }, allergies: "", currentMedications: "" },
        },
      },
    };
    expect(counterpartyMonthDetail(withSnapshot, "u-voss", "clinic", LUMIERE.id, "2026-06")[0].patientName).toBe("Grace Huang");
  });
});
