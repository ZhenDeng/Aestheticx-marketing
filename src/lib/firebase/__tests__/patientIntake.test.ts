import { describe, expect, it } from "vitest";
import { mapPatientIntake } from "@/lib/firebase/patientIntake";
import { siloAccountKey, submissionsForSilo } from "@/lib/demo/patientFormLinks";
import type { Identity } from "@/lib/demo/types";

const doctor: Identity = { user: { id: "u-doc", name: "Dr" }, role: "doctor", context: { kind: "independent" } };
const nurse: Identity = { user: { id: "u-nurse", name: "N" }, role: "nurse", context: { kind: "independent" } };
const nurseAtClinic: Identity = { user: { id: "u-nurse", name: "N" }, role: "nurse", context: { kind: "clinic", clinic: { id: "clinic-1", name: "C" } } };
const adminAtClinic: Identity = { user: { id: "u-admin", name: "A" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-1", name: "C" } } };

describe("siloAccountKey", () => {
  it("applies the ownerFor rule: clinic context wins, then doctor, else nurse", () => {
    expect(siloAccountKey(doctor)).toBe("doctor:u-doc");
    expect(siloAccountKey(nurse)).toBe("nurse:u-nurse");
    expect(siloAccountKey(nurseAtClinic)).toBe("clinic:clinic-1");
    expect(siloAccountKey(adminAtClinic)).toBe("clinic:clinic-1");
  });
});

describe("mapPatientIntake", () => {
  const wire = {
    ownerType: "clinic", ownerId: "clinic-1", token: "tok-1",
    givenName: "Isla", lastName: "Bennett", preferredName: "Izzy",
    dateOfBirth: "1992-04-17", gender: "Female",
    address: "12 Chapel Street", phone: "0400 555 123", email: "isla@example.com",
    allergies: "None known", currentMedications: "None",
    emergencyContact: { name: "Tom", phone: "0400 000 000", relationship: "Partner" },
    submittedAtMillis: 1_754_000_000_000,
  };

  it("decodes a wire doc into the store's submission shape with a silo accountKey", () => {
    const sub = mapPatientIntake("i-1", wire);
    expect(sub.accountKey).toBe("clinic:clinic-1");
    expect(sub.draft.givenName).toBe("Isla");
    expect(sub.draft.dateOfBirth).toEqual({ year: 1992, month: 4, day: 17 });
    expect(sub.draft.emergencyContactName).toBe("Tom");
    expect(sub.submittedAt).toBe(1_754_000_000_000);
  });

  it("degrades junk to blanks the review form's validation then reports", () => {
    const sub = mapPatientIntake("i-2", {
      ownerType: "nurse", ownerId: "u-nurse",
      givenName: 42, dateOfBirth: "17/04/1992", submittedAtMillis: "soon",
    });
    expect(sub.accountKey).toBe("nurse:u-nurse");
    expect(sub.draft.givenName).toBe("");
    expect(sub.draft.dateOfBirth).toBeNull();
    expect(sub.submittedAt).toBe(0);
  });

  it("feeds silo-scoped visibility: clinic members share the clinic's cards", () => {
    const subs = { "i-1": mapPatientIntake("i-1", wire) };
    expect(submissionsForSilo(subs, nurseAtClinic).map((s) => s.id)).toEqual(["i-1"]);
    expect(submissionsForSilo(subs, adminAtClinic).map((s) => s.id)).toEqual(["i-1"]);
    // The same nurse practising independently is a DIFFERENT silo — not visible.
    expect(submissionsForSilo(subs, nurse)).toEqual([]);
    expect(submissionsForSilo(subs, doctor)).toEqual([]);
  });
});
