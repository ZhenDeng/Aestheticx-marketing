import { describe, it, expect } from "vitest";
import {
  mapPatient,
  mapNote,
  mapAuthorisation,
  mapAuthRequest,
  mapAppointment,
  encodeAuthRequest,
  encodeNote,
  parseDob,
  formatDob,
} from "@/lib/firebase/mappers";

describe("parseDob / formatDob", () => {
  it("round-trips yyyy-MM-dd", () => {
    expect(parseDob("1991-03-12")).toEqual({ year: 1991, month: 3, day: 12 });
    expect(formatDob({ year: 1991, month: 3, day: 12 })).toBe("1991-03-12");
  });
  it("handles blank dob", () => {
    expect(parseDob("")).toEqual({ year: 0, month: 0, day: 0 });
  });
});

describe("mapPatient", () => {
  it("maps owner type/id and core fields", () => {
    const p = mapPatient("p1", {
      ownerType: "clinic", ownerId: "clinic-lumiere",
      givenName: "Amara", lastName: "Boyd", dateOfBirth: "1991-03-12",
      gender: "Female", phone: "0401", email: "a@x.com",
      allergies: "Lidocaine", currentMedications: "Levo",
      prescribingDoctorIds: ["u-voss"], alert: "anaphylaxis", preferredName: "Mara",
    });
    expect(p.owner).toEqual({ kind: "clinic", id: "clinic-lumiere" });
    expect(p.givenName).toBe("Amara");
    expect(p.prescribingDoctorIDs).toEqual(["u-voss"]);
    expect(p.preferredName).toBe("Mara");
    expect(p.dateOfBirth).toEqual({ year: 1991, month: 3, day: 12 });
  });
  it("defaults missing owner type to nurse", () => {
    const p = mapPatient("p2", { ownerId: "u-sarah" });
    expect(p.owner).toEqual({ kind: "nurse", id: "u-sarah" });
  });
});

describe("mapAuthorisation", () => {
  it("reads expiresAtMillis and repeatsRemaining", () => {
    const a = mapAuthorisation("a1", {
      requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah",
      clinicId: null, repeatsRemaining: 4, expiresAtMillis: 1800000000000,
      medication: { name: "Letybo", dosage: "16", category: "neurotoxin", unit: "units", areas: ["Forehead"] },
    });
    expect(a.repeatsRemaining).toBe(4);
    expect(a.expiresAt).toBe(1800000000000);
    expect(a.medication.name).toBe("Letybo");
    expect(a.clinicID).toBeNull();
  });
});

describe("mapAuthRequest", () => {
  it("maps status, items, nurse, and patient summary", () => {
    const r = mapAuthRequest("r1", {
      patientId: "p1", nurseId: "u-sarah", nurseName: "Sarah Chen", doctorId: "u-voss",
      clinicId: null, status: "pending", createdAt: 1750000000000,
      items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: ["Full Face"] }],
      patientSummary: { name: "Claire Donovan", dateOfBirth: "1987-07-04", allergies: "NKDA", currentMedications: "Nil" },
    });
    expect(r.status).toBe("pending");
    expect(r.nurse).toEqual({ id: "u-sarah", name: "Sarah Chen" });
    expect(r.items[0].name).toBe("Profhilo");
    expect(r.patientSummary?.fullName).toBe("Claire Donovan");
    expect(r.context).toEqual({ kind: "independent" });
  });
});

describe("mapNote", () => {
  it("maps kind/body/author and consumed ids", () => {
    const n = mapNote("n1", "p1", {
      kind: "treatment", title: "T", body: "B", createdAt: 1750000000000,
      authorId: "u-sarah", authorBadge: "Sarah Chen @ Lumière Clinic",
      consumedAuthorisationIds: ["a1"], medications: [{ name: "Letybo", batch: "C1", expiry: "03/27", dosage: "16U" }],
    });
    expect(n.kind).toBe("treatment");
    expect(n.consumedAuthorisationIDs).toEqual(["a1"]);
    expect(n.medications[0].batch).toBe("C1");
  });
});

describe("mapAppointment", () => {
  it("maps authorisation type to authSlot and core fields", () => {
    const a = mapAppointment("ap1", {
      type: "authorisation", ownerId: "u-voss", dateISO: "2026-06-26",
      startMinute: 540, endMinute: 570, status: "confirmed",
      patientId: "p1", patientName: "Mara Boyd", appointmentNote: "Antiwrinkle",
    });
    expect(a.type).toBe("authSlot");
    expect(a.startMinute).toBe(540);
    expect(a.patientName).toBe("Mara Boyd");
  });
});

describe("encoders", () => {
  it("encodeAuthRequest writes Firestore field names", () => {
    const doc = encodeAuthRequest({
      id: "r1", patientID: "p1", nurse: { id: "u-sarah", name: "Sarah Chen" }, doctorID: "u-voss",
      context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
      items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: ["Full Face"] }],
      status: "pending", createdAt: 1750000000000,
      patientSummary: { fullName: "Claire Donovan", dateOfBirth: { year: 1987, month: 7, day: 4 }, allergies: "NKDA", currentMedications: "Nil" },
    });
    expect(doc.patientId).toBe("p1");
    expect(doc.nurseName).toBe("Sarah Chen");
    expect(doc.clinicId).toBe("clinic-lumiere");
    expect(doc.status).toBe("pending");
    expect((doc.items as unknown[]).length).toBe(1);
  });
  it("encodeNote writes a general note", () => {
    const doc = encodeNote({
      id: "n1", patientID: "p1", kind: "general", title: "", body: "hi", createdAt: 1750000000000,
      authorID: "u-sarah", authorBadge: "Sarah Chen", consumedAuthorisationIDs: [], medications: [],
    });
    expect(doc.kind).toBe("general");
    expect(doc.authorId).toBe("u-sarah");
    expect(doc.body).toBe("hi");
  });
});
