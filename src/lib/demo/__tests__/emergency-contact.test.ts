// Optional patient emergency contact (owner feedback 02/08): all three fields travel as
// one optional group; an absent contact displays "Nil". Pins the draft→stored conversion,
// the display line, and the create path carrying it end to end.
import { describe, expect, it } from "vitest";
import { emptyDraft, emergencyContactFromDraft, emergencyContactLine, type Identity } from "@/lib/demo/types";
import { createPatient } from "@/lib/demo/backend";
import { buildSeedState } from "@/lib/demo/seed";

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

function validDraft() {
  return {
    ...emptyDraft(),
    givenName: "Danni", lastName: "Wang", dateOfBirth: { year: 1992, month: 6, day: 9 },
    gender: "Female", address: "1 Test St", phone: "0400 000 000", email: "danni@x.test",
    allergies: "NKDA", currentMedications: "Nil",
  };
}

describe("emergencyContactFromDraft", () => {
  it("returns undefined when every field is blank (fully optional group)", () => {
    expect(emergencyContactFromDraft(emptyDraft())).toBeUndefined();
    expect(emergencyContactFromDraft({ ...emptyDraft(), emergencyContactName: "   " })).toBeUndefined();
  });
  it("trims and keeps whatever was typed — no partial-blank rejection", () => {
    expect(emergencyContactFromDraft({
      ...emptyDraft(),
      emergencyContactName: " Tomas Boyd ", emergencyContactPhone: "0401 887 662", emergencyContactRelationship: "Husband",
    })).toEqual({ name: "Tomas Boyd", phone: "0401 887 662", relationship: "Husband" });
    expect(emergencyContactFromDraft({ ...emptyDraft(), emergencyContactPhone: "0401 887 662" }))
      .toEqual({ name: "", phone: "0401 887 662", relationship: "" });
  });
});

describe("emergencyContactLine", () => {
  it("shows Nil when there is no contact", () => {
    expect(emergencyContactLine(undefined)).toBe("Nil");
    expect(emergencyContactLine({ name: " ", phone: "", relationship: "" })).toBe("Nil");
  });
  it("joins the present fields with · separators", () => {
    expect(emergencyContactLine({ name: "Tomas Boyd", phone: "0401 887 662", relationship: "Husband" }))
      .toBe("Tomas Boyd · 0401 887 662 · Husband");
    expect(emergencyContactLine({ name: "Tomas Boyd", phone: "", relationship: "" })).toBe("Tomas Boyd");
  });
});

describe("createPatient carries the emergency contact", () => {
  it("stores the contact from the draft, undefined when blank", () => {
    const state = buildSeedState();
    const withContact = createPatient(state, {
      ...validDraft(),
      emergencyContactName: "Lena Wang", emergencyContactPhone: "0400 111 222", emergencyContactRelationship: "Sister",
    }, nurse);
    expect(withContact.patient.emergencyContact)
      .toEqual({ name: "Lena Wang", phone: "0400 111 222", relationship: "Sister" });

    const without = createPatient(state, validDraft(), nurse);
    expect(without.patient.emergencyContact).toBeUndefined();
  });
});
