import { describe, it, expect } from "vitest";
import {
  mapPatient,
  mapNote,
  mapAuthorisation,
  mapEmergencyAuthorisation,
  mapAuditLogEntry,
  mapAuthRequest,
  mapAppointment,
  mapExternalBusy,
  mapAvailabilityWindow,
  mapTreatmentAvailability,
  encodeAuthRequest,
  encodeNote,
  parseDob,
  formatDob,
} from "@/lib/firebase/mappers";
import { encodePatientForCreate, encodePatientEdits } from "@/lib/firebase/mappers";
import { mapForm, encodeForm } from "@/lib/firebase/mappers";
import type { SignedFormRecord } from "@/lib/demo/types";
import type { Patient } from "@/lib/demo/types";

const patient: Patient = {
  id: "p1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1991, month: 3, day: 12 },
  gender: "Female", address: "x", phone: "0401", email: "a@x.com", allergies: "NKDA",
  currentMedications: "Nil", owner: { kind: "clinic", id: "clinic-lumiere" },
  prescribingDoctorIDs: ["u-voss"], alert: "anaphylaxis", preferredName: "Mara",
};

describe("mapEmergencyAuthorisation", () => {
  it("maps fields, converts timestamps, keeps a valid kind", () => {
    const rec = mapEmergencyAuthorisation("p1_d1_hyaluronidase", {
      patientId: "p1", doctorId: "d1", doctorName: "Dr Voss", kind: "hyaluronidase",
      createdAt: { toMillis: () => 100 }, refreshedAt: { toMillis: () => 200 },
      expiresAtMillis: 1800000000000, sourceAuthorisationIds: ["a1", "a2"],
    });
    expect(rec).toEqual({
      id: "p1_d1_hyaluronidase", patientID: "p1", doctorID: "d1", doctorName: "Dr Voss",
      kind: "hyaluronidase", createdAt: 100, refreshedAt: 200, expiresAt: 1800000000000,
      sourceAuthorisationIDs: ["a1", "a2"],
    });
  });
  it("defaults an unknown kind to adrenaline and a missing name to 'Doctor'", () => {
    const rec = mapEmergencyAuthorisation("x", { kind: "weird" });
    expect(rec.kind).toBe("adrenaline");
    expect(rec.doctorName).toBe("Doctor");
    expect(rec.sourceAuthorisationIDs).toEqual([]);
  });
});

describe("mapAuditLogEntry", () => {
  it("maps fields, converts the timestamp, and keeps a known action", () => {
    const rec = mapAuditLogEntry("au1", {
      actorId: "u-admin", actorName: "Priya Nair", actorRole: "superAdmin",
      action: "admin_patient_access", targetType: "patient", targetId: "p-1",
      summary: "opened Danni Wang", at: { toMillis: () => 1700 },
    });
    expect(rec).toEqual({
      id: "au1", actorID: "u-admin", actorName: "Priya Nair", actorRole: "superAdmin",
      action: "admin_patient_access", targetType: "patient", targetID: "p-1",
      summary: "opened Danni Wang", at: 1700,
    });
  });
  it("tolerates missing fields — null targets, empty strings, a fallback action + name", () => {
    const rec = mapAuditLogEntry("au2", { action: "not_a_real_action" });
    expect(rec.action).toBe("admin_patient_access"); // unknown → safe fallback
    expect(rec.actorName).toBe("Admin");
    expect(rec.actorRole).toBe("");
    expect(rec.targetType).toBeNull();
    expect(rec.targetID).toBeNull();
    expect(rec.at).toBe(0);
  });
});

describe("encodePatientForCreate", () => {
  it("writes ownerType/ownerId + dob string and omits prescribingDoctorIds", () => {
    const doc = encodePatientForCreate(patient);
    expect(doc.ownerType).toBe("clinic");
    expect(doc.ownerId).toBe("clinic-lumiere");
    expect(doc.dateOfBirth).toBe("1991-03-12");
    expect("prescribingDoctorIds" in doc).toBe(false);
    expect(doc.alert).toBe("anaphylaxis");
  });
});

describe("encodePatientEdits", () => {
  it("omits owner + prescribers (rules block changing them)", () => {
    const doc = encodePatientEdits(patient);
    expect("ownerType" in doc).toBe(false);
    expect("ownerId" in doc).toBe(false);
    expect("prescribingDoctorIds" in doc).toBe(false);
    expect(doc.givenName).toBe("Amara");
    expect(doc.preferredName).toBe("Mara");
  });
  it("carries avatarFileId (iOS LiveBackend.encode wire parity) but never the demo dataUrl", () => {
    const doc = encodePatientEdits({ ...patient, avatarFileId: "patients/p1/avatar/a.jpg", avatarDataUrl: "data:x" });
    expect(doc.avatarFileId).toBe("patients/p1/avatar/a.jpg");
    expect("avatarDataUrl" in doc).toBe(false);
    // Unset avatar stays a null field, matching iOS's always-present key.
    expect(encodePatientEdits(patient).avatarFileId).toBeNull();
  });
});

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
  it("maps avatarFileId, absent or null -> undefined", () => {
    expect(mapPatient("p3", { ownerId: "u-sarah", avatarFileId: "patients/p3/avatar/a.jpg" }).avatarFileId)
      .toBe("patients/p3/avatar/a.jpg");
    expect(mapPatient("p4", { ownerId: "u-sarah" }).avatarFileId).toBeUndefined();
    expect(mapPatient("p5", { ownerId: "u-sarah", avatarFileId: null }).avatarFileId).toBeUndefined();
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
    expect(n.attachments).toEqual([]);
  });
  it("maps attachments, keeping only their string fields", () => {
    const n = mapNote("n2", "p1", {
      kind: "general", title: "", body: "", createdAt: 0, authorId: "u", authorBadge: "RN",
      attachments: [
        { fileId: "patients/p1/photos/a.png", displayName: "before.png", mimeType: "image/png", junk: 1 },
        "nope",
      ],
    });
    expect(n.attachments).toEqual([
      { fileID: "patients/p1/photos/a.png", displayName: "before.png", mimeType: "image/png" },
    ]);
  });
});

describe("mapExternalBusy", () => {
  it("maps events, zone, and updatedAt; drops junk entries", () => {
    const c = mapExternalBusy("u-voss", {
      timeZone: "Australia/Sydney",
      updatedAt: 1750000000000,
      events: [
        { startISO: "2026-06-26T02:30:00Z", endISO: "2026-06-26T03:30:00Z", transparent: false, id: "e1" },
        { startISO: "", endISO: "2026-06-26T03:30:00Z" }, // missing start — dropped
        "junk",
      ],
    });
    expect(c.ownerID).toBe("u-voss");
    expect(c.timeZone).toBe("Australia/Sydney");
    expect(c.updatedAtMillis).toBe(1750000000000);
    expect(c.events).toEqual([{ startISO: "2026-06-26T02:30:00Z", endISO: "2026-06-26T03:30:00Z", transparent: false, id: "e1" }]);
  });
  it("defaults the zone and tolerates a missing events array", () => {
    const c = mapExternalBusy("u-voss", {});
    expect(c.timeZone).toBe("Australia/Sydney");
    expect(c.events).toEqual([]);
    expect(c.updatedAtMillis).toBeUndefined();
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
    expect(a.lead).toBeUndefined();
    expect(a.bookedByID).toBeUndefined();
  });

  it("maps bookedById so the auth slot shows on the booker's calendar", () => {
    const a = mapAppointment("ap4", {
      type: "authorisation", ownerId: "u-voss", bookedById: "clinic-lumiere", dateISO: "2026-06-26",
      startMinute: 540, endMinute: 550, status: "confirmed", patientId: "p1",
    });
    expect(a.ownerID).toBe("u-voss");
    expect(a.bookedByID).toBe("clinic-lumiere");
  });

  it("maps a new-patient lead, keeping only its string fields", () => {
    const a = mapAppointment("ap2", {
      type: "authorisation", ownerId: "u-voss", dateISO: "2026-06-26",
      startMinute: 540, endMinute: 550, status: "confirmed", patientId: null,
      lead: { givenName: "Jordan", lastName: "Lee", dob: "1990-01-15", phone: "0400111222", email: "j@example.com", junk: 42 },
    });
    expect(a.patientID).toBeUndefined();
    expect(a.lead).toEqual({ givenName: "Jordan", lastName: "Lee", dob: "1990-01-15", phone: "0400111222", email: "j@example.com" });
  });

  it("ignores a non-object lead", () => {
    const a = mapAppointment("ap3", {
      type: "treatment", ownerId: "u-voss", dateISO: "2026-06-26",
      startMinute: 540, endMinute: 570, status: "confirmed", lead: "nope",
    });
    expect(a.lead).toBeUndefined();
  });
});

describe("mapAvailabilityWindow", () => {
  it("maps a slotPublications doc to an availability window", () => {
    const w = mapAvailabilityWindow("u-voss_2026-06-26_540", {
      doctorId: "u-voss", dateISO: "2026-06-26", startMinute: 540, endMinute: 600, slotStarts: [540, 550],
    });
    expect(w).toMatchObject({ id: "u-voss_2026-06-26_540", doctorID: "u-voss", doctorName: "", dateISO: "2026-06-26", startMinute: 540, endMinute: 600 });
  });
});

describe("mapTreatmentAvailability", () => {
  it("expands the backend's sparse windows[] into a dense Mon-first days[7]", () => {
    // Backend weekday is getUTCDay (0=Sun…6=Sat): 1=Mon, 6=Sat. Web days[] is Mon-first.
    const cfg = mapTreatmentAvailability("u-voss", {
      windows: [
        { weekday: 1, openMinute: 540, closeMinute: 1020 }, // Mon → web index 0
        { weekday: 6, openMinute: 600, closeMinute: 720 },  // Sat → web index 5
      ],
      blocks: [{ dateISO: "2026-07-01", startMinute: 780, endMinute: 840 }],
    });
    expect(cfg.ownerID).toBe("u-voss");
    expect(cfg.days[0]).toEqual({ open: true, openMinute: 540, closeMinute: 1020 }); // Mon open
    expect(cfg.days[5]).toEqual({ open: true, openMinute: 600, closeMinute: 720 });  // Sat open
    expect(cfg.days[1].open).toBe(false); // Tue — no window → closed
    expect(cfg.days[6].open).toBe(false); // Sun (backend weekday 0) — no window → closed
  });

  it("synthesises a stable id per block and handles a missing doc shape", () => {
    const cfg = mapTreatmentAvailability("u-x", {
      blocks: [{ dateISO: "2026-07-01", startMinute: 780, endMinute: 840 }],
    });
    expect(cfg.blocks[0]).toEqual({ id: "2026-07-01_780_840", dateISO: "2026-07-01", startMinute: 780, endMinute: 840 });
    // No windows array → every day closed (falls back to default closed hours).
    expect(cfg.days.every((d) => !d.open)).toBe(true);
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
    expect(doc.attachments).toEqual([]); // iOS parity: always written
  });
  it("encodeNote writes attachments without the demo-only dataUrl", () => {
    const doc = encodeNote({
      id: "n1", patientID: "p1", kind: "general", title: "", body: "", createdAt: 0,
      authorID: "u", authorBadge: "RN", consumedAuthorisationIDs: [], medications: [],
      attachments: [
        { fileID: "patients/p1/photos/a.png", displayName: "before.png", mimeType: "image/png", dataUrl: "data:image/png;base64,x" },
        { fileID: "patients/p1/files/b.pdf", displayName: "Consent.pdf", mimeType: "application/pdf" },
      ],
    });
    expect(doc.attachments).toEqual([
      { fileId: "patients/p1/photos/a.png", displayName: "before.png", mimeType: "image/png" },
      { fileId: "patients/p1/files/b.pdf", displayName: "Consent.pdf", mimeType: "application/pdf" },
    ]);
  });
});

describe("form mappers", () => {
  it("round-trips a signed form", () => {
    const form: SignedFormRecord = {
      id: "f1", patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice",
      signedAt: 1750000000000, answers: [{ questionID: "q", answer: true, detail: "d" }],
      intro: "intro", clauses: ["c1", "off-label"], signatureFileId: "patients/p1/signatures/f1.png",
    };
    const doc = encodeForm(form);
    expect(doc.template).toBe("antiwrinkleConsent");
    expect(doc.signatureImageFileId).toBe("patients/p1/signatures/f1.png");
    expect((doc.answers as unknown[]).length).toBe(1);
    const back = mapForm("f1", "p1", doc as Record<string, unknown>);
    expect(back.template).toBe("antiwrinkleConsent");
    expect(back.clauses).toEqual(["c1", "off-label"]);
    expect(back.answers[0].questionID).toBe("q");
    expect(back.signatureFileId).toBe("patients/p1/signatures/f1.png");
  });
});
