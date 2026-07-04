import { describe, it, expect } from "vitest";
import {
  emptyState, recordAftercareSend, canSendAftercare, usableAuthorisations, notePreview,
  notesForPatient, visibleNotesForPatient, patientPermissions,
  saveGeneralNote, saveTreatmentNote, isImageAttachment, imageAttachments,
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

// Spec (clinical-notes — note-kind visibility for prescriber-only doctors): a doctor who
// can view a file ONLY via prescribingDoctorIDs loses general-note visibility entirely
// (and never writes general notes — the patient isn't under their name); every other
// viewing identity keeps it, including the read-only super admin.
describe("note-kind visibility for prescriber-only doctors", () => {
  const drVoss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
  const superAdmin: Identity = { user: { id: "u-root", name: "Platform Admin" }, role: "superAdmin", context: { kind: "independent" } };
  const clinicNurse: Identity = {
    user: { id: "u-mei", name: "Mei Tan" }, role: "nurse",
    context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
  };
  const clinicAdmin: Identity = {
    user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin",
    context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
  };

  const baseNote: Omit<Note, "id" | "kind" | "createdAt"> = {
    patientID: "p1", title: "", body: "b", authorID: "u-sarah", authorBadge: "RN",
    consumedAuthorisationIDs: [], medications: [],
  };
  // One note of each kind, oldest first — the stream must come back newest first.
  const allKinds: Note[] = [
    { ...baseNote, id: "n-gen", kind: "general", createdAt: 1 },
    { ...baseNote, id: "n-trt", kind: "treatment", createdAt: 2 },
    { ...baseNote, id: "n-aft", kind: "aftercareRecord", createdAt: 3 },
  ];
  function stateWithNotes(patient: Patient): DemoState {
    return { ...stateWith(patient), notesByPatient: { [patient.id]: allKinds } };
  }

  it("denies a prescriber-only doctor general-note visibility AND general-note write", () => {
    const p: Patient = { ...nursePatient("p1", "u-sarah"), prescribingDoctorIDs: ["u-voss"] };
    const perms = patientPermissions(drVoss, p);
    expect(perms.canView).toBe(true);
    expect(perms.canWriteTreatmentNote).toBe(true);
    expect(perms.canViewGeneralNotes).toBe(false);
    expect(perms.canWriteGeneralNote).toBe(false); // patient isn't under their name
  });

  it("denies the same on another clinic's patient reached only via prescribing", () => {
    const p: Patient = { ...nursePatient("p1", "x"), owner: { kind: "clinic", id: "clinic-other" }, prescribingDoctorIDs: ["u-voss"] };
    const perms = patientPermissions(drVoss, p);
    expect(perms.canViewGeneralNotes).toBe(false);
    expect(perms.canWriteGeneralNote).toBe(false);
    expect(perms.canWriteTreatmentNote).toBe(true);
  });

  it("shows a prescriber-only doctor treatment notes only (general + aftercare hidden)", () => {
    const p: Patient = { ...nursePatient("p1", "u-sarah"), prescribingDoctorIDs: ["u-voss"] };
    expect(visibleNotesForPatient(stateWithNotes(p), "p1", drVoss).map((n) => n.id)).toEqual(["n-trt"]);
  });

  it("shows the owner every kind, newest first", () => {
    const p = nursePatient("p1", "u-sarah");
    expect(visibleNotesForPatient(stateWithNotes(p), "p1", nurse).map((n) => n.id)).toEqual(["n-aft", "n-trt", "n-gen"]);
  });

  it("shows clinic members every kind", () => {
    const p: Patient = { ...nursePatient("p1", "x"), owner: { kind: "clinic", id: "clinic-lumiere" } };
    const state = stateWithNotes(p);
    expect(visibleNotesForPatient(state, "p1", clinicNurse)).toHaveLength(3);
    expect(visibleNotesForPatient(state, "p1", clinicAdmin)).toHaveLength(3);
  });

  it("shows the super admin every kind (inspects everything, edits nothing)", () => {
    const p = nursePatient("p1", "u-sarah");
    expect(visibleNotesForPatient(stateWithNotes(p), "p1", superAdmin)).toHaveLength(3);
  });

  it("returns nothing for a viewer without file access, or a missing patient", () => {
    const p = nursePatient("p1", "u-sarah"); // drVoss isn't a prescriber here
    expect(visibleNotesForPatient(stateWithNotes(p), "p1", drVoss)).toEqual([]);
    expect(visibleNotesForPatient(emptyState(), "nope", nurse)).toEqual([]);
  });
});
