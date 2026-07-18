import { describe, it, expect } from "vitest";
import { mapNote, encodeNote } from "@/lib/firebase/mappers";
import {
  emptyState, recordAftercareSend, setNoteDeliveryStatus, notesForPatient, BackendError,
} from "@/lib/demo/backend";
import type { DemoState, Identity, Note, Patient } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };

function patientState(): DemoState {
  const p: Patient = {
    id: "p1", givenName: "A", lastName: "B", dateOfBirth: { year: 1990, month: 1, day: 1 },
    gender: "Female", address: "", phone: "0", email: "a@b.com", allergies: "NKDA",
    currentMedications: "Nil", owner: { kind: "doctor", id: "u-voss" }, prescribingDoctorIDs: [],
  };
  return { ...emptyState(), patients: { p1: p } };
}

const base: Note = {
  id: "n1", patientID: "p1", kind: "aftercareRecord", title: "Aftercare sent", body: "Body",
  createdAt: 1000, authorID: "u-voss", authorBadge: "Dr Voss", consumedAuthorisationIDs: [], medications: [],
  deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"],
};

describe("note delivery-status mapper", () => {
  it("round-trips deliveryStatus + aftercareCategories", () => {
    const doc = encodeNote(base);
    expect(doc).toMatchObject({ deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"] });
    const mapped = mapNote("n1", "p1", doc);
    expect(mapped.deliveryStatus).toBe("failed");
    expect(mapped.aftercareCategories).toEqual(["antiwrinkle"]);
  });
  it("leaves deliveryStatus undefined + categories empty when absent", () => {
    const mapped = mapNote("n2", "p1", { kind: "general", title: "", body: "x" });
    expect(mapped.deliveryStatus).toBeUndefined();
    expect(mapped.aftercareCategories).toEqual([]);
  });
  it("defaults an unknown deliveryStatus to undefined", () => {
    const mapped = mapNote("n3", "p1", { kind: "aftercareRecord", deliveryStatus: "weird" });
    expect(mapped.deliveryStatus).toBeUndefined();
  });
});

// The mailDelivery trigger records WHY a send failed (`failureReason`, e.g. the verbatim
// Resend rejection) and mirrors it onto the note. Dropping it on the floor here is what made
// the 18/07 "always queued then failed" report undiagnosable, so it must survive the mapper.
describe("note failureReason mapper", () => {
  it("round-trips failureReason on a failed note", () => {
    const reason = "provider 403: You can only send testing emails to your own address.";
    const doc = encodeNote({ ...base, failureReason: reason });
    expect(doc).toMatchObject({ failureReason: reason });
    expect(mapNote("n1", "p1", doc).failureReason).toBe(reason);
  });
  it("leaves failureReason undefined when absent", () => {
    expect(mapNote("n2", "p1", { kind: "aftercareRecord", deliveryStatus: "failed" }).failureReason).toBeUndefined();
  });
  it("omits failureReason from the encoded doc when unset", () => {
    expect(encodeNote(base)).not.toHaveProperty("failureReason");
  });
  it("ignores a non-string failureReason rather than coercing it to empty", () => {
    expect(mapNote("n3", "p1", { kind: "aftercareRecord", failureReason: 42 }).failureReason).toBeUndefined();
  });
});

describe("recordAftercareSend delivery fields", () => {
  it("records a queued send with the chosen categories", () => {
    const { state, note } = recordAftercareSend(
      patientState(), { patientID: "p1", content: "c", medications: [], categories: ["antiwrinkle", "skinbooster"], identity: voss }, 1,
    );
    expect(note.deliveryStatus).toBe("queued");
    expect(note.aftercareCategories).toEqual(["antiwrinkle", "skinbooster"]);
    expect(notesForPatient(state, "p1")[0].deliveryStatus).toBe("queued");
  });
});

describe("setNoteDeliveryStatus", () => {
  it("flips the note's delivery status", () => {
    const { state, note } = recordAftercareSend(patientState(), { patientID: "p1", content: "c", medications: [], categories: [], identity: voss }, 1);
    const next = setNoteDeliveryStatus(state, "p1", note.id, "delivered", voss);
    expect(notesForPatient(next, "p1")[0].deliveryStatus).toBe("delivered");
  });
  // Backend parity: mail.ts mirrorToNote deletes failureReason when a retry succeeds, so a
  // delivered note must never keep the reason its earlier failure recorded.
  it("clears failureReason when a retry flips the note to delivered", () => {
    const state: DemoState = {
      ...patientState(),
      notesByPatient: { p1: [{ ...base, failureReason: "provider 422: recipient mailbox is full" }] },
    };
    const next = setNoteDeliveryStatus(state, "p1", "n1", "delivered", voss);
    expect(notesForPatient(next, "p1")[0].deliveryStatus).toBe("delivered");
    expect(notesForPatient(next, "p1")[0].failureReason).toBeUndefined();
  });
  it("throws on a missing note", () => {
    expect(() => setNoteDeliveryStatus(patientState(), "p1", "nope", "delivered", voss)).toThrow(BackendError);
  });
  it("throws on a missing patient", () => {
    expect(() => setNoteDeliveryStatus(emptyState(), "px", "n", "delivered", voss)).toThrow(BackendError);
  });
  it("rejects a clinic admin (may write general notes but not send/manage aftercare)", () => {
    const clinicPatient: Patient = { ...patientState().patients.p1, owner: { kind: "clinic", id: "clinic-lumiere" } };
    const admin: Identity = { user: { id: "u-ava", name: "Ava" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };
    const state: DemoState = { ...emptyState(), patients: { p1: clinicPatient }, notesByPatient: { p1: [{ id: "n1", patientID: "p1", kind: "aftercareRecord", title: "", body: "", createdAt: 0, authorID: "u", authorBadge: "RN", consumedAuthorisationIDs: [], medications: [], deliveryStatus: "failed" }] } };
    expect(() => setNoteDeliveryStatus(state, "p1", "n1", "delivered", admin)).toThrow(BackendError);
  });
});
