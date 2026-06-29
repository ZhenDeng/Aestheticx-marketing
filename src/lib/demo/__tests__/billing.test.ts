import { describe, it, expect } from "vitest";
import { billingSummary, partyLabel, monthKey, monthLabel } from "@/lib/demo/billing";
import type { Authorisation, Identity, MedicationItem } from "@/lib/demo/types";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

const doctor: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const nurseIndep: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const clinicAdmin: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

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

describe("monthKey / monthLabel", () => {
  it("formats UTC month key and a human label", () => {
    expect(monthKey(Date.UTC(2026, 5, 26))).toBe("2026-06");
    expect(monthLabel("2026-06")).toBe("June 2026");
    expect(monthLabel("bogus")).toBe("bogus");
  });
});
