import { describe, it, expect } from "vitest";
import {
  emptyState, recordAftercareSend, canSendAftercare, usableAuthorisations, notePreview,
  notesForPatient, saveGeneralNote, saveTreatmentNote, isImageAttachment, imageAttachments,
  BackendError,
} from "@/lib/demo/backend";
import type { DemoState, Identity, Note, NoteAttachment, Patient } from "@/lib/demo/types";

const nurse: Identity = {
  user: { id: "u-sarah", name: "Sarah Chen" },
  role: "nurse",
  context: { kind: "independent" },
};

function nursePatient(id: string, ownerID: string): Patient {
  return {
    id,
    givenName: "Claire",
    lastName: "Donovan",
    dateOfBirth: { year: 1987, month: 7, day: 4 },
    gender: "Female",
    address: "",
    phone: "0432 901 343",
    email: "claire@example.com",
    allergies: "NKDA",
    currentMedications: "Nil",
    owner: { kind: "nurse", id: ownerID },
    prescribingDoctorIDs: [],
  };
}

function stateWith(...patients: Patient[]): DemoState {
  return { ...emptyState(), patients: Object.fromEntries(patients.map((p) => [p.id, p])) };
}

describe("notePreview", () => {
  const base: Note = {
    id: "n1", patientID: "p1", kind: "general", title: "", body: "",
    createdAt: 0, authorID: "u", authorBadge: "RN", consumedAuthorisationIDs: [], medications: [],
  };
  it("shows the title when set", () => {
    expect(notePreview({ ...base, title: "Follow-up call", body: "blah" })).toBe("Follow-up call");
  });
  it("shows the first body line + ellipsis when the title is empty", () => {
    expect(notePreview({ ...base, title: "", body: "First line\nsecond" })).toBe("First line…");
  });
  it("handles an empty note", () => {
    expect(notePreview({ ...base, title: "", body: "" })).toBe("(empty note)");
  });
});

// Spec (clinical-notes — photo and file attachments): both note kinds accept attachments;
// photos are the image/* ones.
describe("note attachments", () => {
  const photo: NoteAttachment = {
    fileID: "patients/p1/photos/a1.png", displayName: "before.png", mimeType: "image/png",
    dataUrl: "data:image/png;base64,x",
  };
  const pdf: NoteAttachment = {
    fileID: "patients/p1/files/a2.pdf", displayName: "Consent.pdf", mimeType: "application/pdf",
  };
  const doctor: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };

  it("saveGeneralNote stamps attachments onto the note", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const { note } = saveGeneralNote(state, {
      patientID: "p1", title: "", body: "photos attached", attachments: [photo, pdf], identity: nurse,
    }, 0);
    expect(note.attachments).toEqual([photo, pdf]);
  });
  it("saveTreatmentNote (doctor direct, nothing ticked) stamps attachments", () => {
    const p: Patient = { ...nursePatient("p1", "u-voss"), owner: { kind: "doctor", id: "u-voss" } };
    const { note } = saveTreatmentNote(stateWith(p), {
      patientID: "p1", tickedIDs: [], title: "T", body: "b", medications: [], attachments: [photo], identity: doctor,
    }, 0);
    expect(note.attachments).toEqual([photo]);
  });
  it("classifies images by mime type", () => {
    expect(isImageAttachment(photo)).toBe(true);
    expect(isImageAttachment(pdf)).toBe(false);
  });
  it("imageAttachments filters photos only, tolerating notes without attachments", () => {
    const base: Note = {
      id: "n1", patientID: "p1", kind: "general", title: "", body: "",
      createdAt: 0, authorID: "u", authorBadge: "RN", consumedAuthorisationIDs: [], medications: [],
    };
    expect(imageAttachments({ ...base, attachments: [photo, pdf] })).toEqual([photo]);
    expect(imageAttachments(base)).toEqual([]);
  });
});

describe("canSendAftercare", () => {
  const mk = (role: Identity["role"]): Identity =>
    ({ user: { id: "u", name: "U" }, role, context: { kind: "independent" } });
  it("allows nurse and doctor", () => {
    expect(canSendAftercare(mk("nurse"))).toBe(true);
    expect(canSendAftercare(mk("doctor"))).toBe(true);
  });
  it("denies clinic admin and super admin", () => {
    expect(canSendAftercare(mk("clinicAdmin"))).toBe(false);
    expect(canSendAftercare(mk("superAdmin"))).toBe(false);
  });
});

describe("recordAftercareSend", () => {
  it("appends an aftercareRecord note with the exact content + medications", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const meds = [{ name: "Botox", batch: "B1", expiry: "12/26", dosage: "20u" }];
    const { state: next, note } = recordAftercareSend(
      state, { patientID: "p1", content: "Sent text", medications: meds, categories: [], identity: nurse }, 1_000,
    );
    expect(note.kind).toBe("aftercareRecord");
    expect(note.title).toBe("Aftercare sent");
    expect(note.body).toBe("Sent text");
    expect(note.medications).toEqual(meds);
    expect(notesForPatient(next, "p1")[0].id).toBe(note.id); // newest first
  });

  it("rejects a clinic admin (may view but not send aftercare)", () => {
    const clinicPatient: Patient = { ...nursePatient("p1", "x"), owner: { kind: "clinic", id: "clinic-lumiere" } };
    const admin: Identity = {
      user: { id: "u-ava", name: "Ava Lim" },
      role: "clinicAdmin",
      context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
    };
    const state = stateWith(clinicPatient);
    expect(() => recordAftercareSend(state, { patientID: "p1", content: "x", medications: [], categories: [], identity: admin }, 1))
      .toThrow(BackendError);
  });

  it("rejects a missing patient", () => {
    expect(() => recordAftercareSend(emptyState(), { patientID: "nope", content: "x", medications: [], categories: [], identity: nurse }, 1))
      .toThrow(BackendError);
  });
});

describe("usableAuthorisations", () => {
  it("returns an array (no usable authorisations in an empty state)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(usableAuthorisations(state, "p1", nurse, Date.now())).toEqual([]);
  });
});
