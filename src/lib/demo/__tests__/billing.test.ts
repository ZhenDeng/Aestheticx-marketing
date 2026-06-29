import { describe, it, expect } from "vitest";
import { billingSummary, partyLabel, monthKey, monthLabel } from "@/lib/demo/billing";
import type { BillingEvent, Identity } from "@/lib/demo/types";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

const doctor: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const nurseIndep: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const clinicAdmin: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

const clinicEvent: BillingEvent = {
  id: "ev1", requestID: "r1", patientID: "p1", doctorID: "u-voss",
  counterpartyType: "clinic", counterpartyID: LUMIERE.id, monthKey: "2026-06", createdAt: Date.UTC(2026, 5, 26),
};

describe("billingSummary", () => {
  it("a doctor sees the event grouped by counterparty (the clinic)", () => {
    const s = billingSummary([clinicEvent], doctor);
    expect(s.totalCount).toBe(1);
    expect(s.months).toHaveLength(1);
    expect(s.months[0].monthKey).toBe("2026-06");
    expect(s.months[0].byParty).toEqual([{ id: LUMIERE.id, type: "clinic", count: 1 }]);
  });
  it("a clinic admin sees it grouped by the doctor", () => {
    const s = billingSummary([clinicEvent], clinicAdmin);
    expect(s.totalCount).toBe(1);
    expect(s.months[0].byParty).toEqual([{ id: "u-voss", type: "doctor", count: 1 }]);
  });
  it("an independent nurse sees nothing (the event is billable to the clinic)", () => {
    const s = billingSummary([clinicEvent], nurseIndep);
    expect(s.totalCount).toBe(0);
    expect(s.months).toEqual([]);
  });
  it("sorts months descending", () => {
    const older: BillingEvent = { ...clinicEvent, id: "ev0", monthKey: "2026-05" };
    const s = billingSummary([clinicEvent, older], doctor);
    expect(s.months.map((m) => m.monthKey)).toEqual(["2026-06", "2026-05"]);
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
