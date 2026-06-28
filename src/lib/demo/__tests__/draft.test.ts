import { describe, it, expect } from "vitest";
import { emptyDraft, draftFromPatient, type Patient } from "@/lib/demo/types";

const patient: Patient = {
  id: "p1", givenName: "Amara", lastName: "Boyd",
  dateOfBirth: { year: 1991, month: 3, day: 12 }, gender: "Female",
  address: "7 St Kilda", phone: "0401", email: "a@x.com",
  allergies: "Lidocaine", currentMedications: "Levo",
  owner: { kind: "clinic", id: "clinic-lumiere" }, prescribingDoctorIDs: ["u-voss"],
  alert: "anaphylaxis", preferredName: "Mara",
};

describe("emptyDraft", () => {
  it("is all-blank with a null dob", () => {
    const d = emptyDraft();
    expect(d.givenName).toBe("");
    expect(d.dateOfBirth).toBeNull();
    expect(d.gender).toBe("");
  });
});

describe("draftFromPatient", () => {
  it("copies fields for editing", () => {
    const d = draftFromPatient(patient);
    expect(d.givenName).toBe("Amara");
    expect(d.dateOfBirth).toEqual({ year: 1991, month: 3, day: 12 });
    expect(d.preferredName).toBe("Mara");
    expect(d.alert).toBe("anaphylaxis");
  });
});
