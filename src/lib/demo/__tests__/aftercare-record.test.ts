import { describe, it, expect } from "vitest";
import { mapNote, encodeNote } from "@/lib/firebase/mappers";
import { emptyState, recordAftercareSend, notesForPatient, BackendError } from "@/lib/demo/backend";
import type { DemoState, Identity, Note, Patient } from "@/lib/demo/types";

// 19/07: aftercare is sent by the practitioner's own mail client, so the app records only that
// aftercare was ISSUED — no delivery status, no failure reason, no retry. (Replaces
// email-delivery.test.ts, which covered the removed Resend status pipeline.)

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-ava", name: "Ava" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };

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
  aftercareCategories: ["antiwrinkle"],
};

describe("aftercare record mapper", () => {
  it("round-trips the aftercare categories", () => {
    const doc = encodeNote(base);
    expect(doc).toMatchObject({ aftercareCategories: ["antiwrinkle"] });
    expect(mapNote("n1", "p1", doc).aftercareCategories).toEqual(["antiwrinkle"]);
  });

  it("leaves categories empty when absent", () => {
    expect(mapNote("n2", "p1", { kind: "general", title: "", body: "x" }).aftercareCategories).toEqual([]);
  });

  // Notes written before this change still carry deliveryStatus/failureReason in Firestore.
  // They must map to a plain aftercare record — never resurrect a badge for them.
  it("ignores a legacy deliveryStatus / failureReason on an existing note", () => {
    const mapped = mapNote("n3", "p1", {
      kind: "aftercareRecord", body: "old", deliveryStatus: "failed",
      failureReason: "provider 403: sandbox sender", aftercareCategories: ["haFiller"],
    }) as Note & { deliveryStatus?: unknown; failureReason?: unknown };
    expect(mapped.deliveryStatus).toBeUndefined();
    expect(mapped.failureReason).toBeUndefined();
    expect(mapped.aftercareCategories).toEqual(["haFiller"]);
  });

  // The Firestore notes-create rule pins an exact key allowlist, and failureReason was never on
  // it — now that the client writes aftercare notes itself, an extra key means a rejected write.
  it("encodes only keys the notes-create rule allows", () => {
    const allowed = new Set([
      "kind", "title", "body", "createdAt", "authorId", "authorBadge",
      "consumedAuthorisationIds", "medications", "attachments", "aftercareCategories", "deliveryStatus",
    ]);
    expect(Object.keys(encodeNote(base)).filter((k) => !allowed.has(k))).toEqual([]);
  });
});

describe("recordAftercareSend", () => {
  it("records the issued content and categories, with no delivery status", () => {
    const { state, note } = recordAftercareSend(
      patientState(),
      { patientID: "p1", content: "c", medications: [], categories: ["antiwrinkle", "skinbooster"], identity: voss },
      1,
    );
    expect(note.kind).toBe("aftercareRecord");
    expect(note.aftercareCategories).toEqual(["antiwrinkle", "skinbooster"]);
    expect(note).not.toHaveProperty("deliveryStatus");
    expect(notesForPatient(state, "p1")[0].id).toBe(note.id);
  });

  // Feedback 2026-07-21 (bug 3): the clinic admin's toolkit is create clients + general
  // notes + forms + AFTERCARE — sending aftercare is now allowed (reverses the earlier
  // clinical-notes spec restriction).
  it("lets the clinic admin send aftercare for the clinic's patients", () => {
    const clinicPatient: Patient = { ...patientState().patients.p1, owner: { kind: "clinic", id: "clinic-lumiere" } };
    const state: DemoState = { ...emptyState(), patients: { p1: clinicPatient } };
    const { note } = recordAftercareSend(
      state, { patientID: "p1", content: "c", medications: [], categories: ["antiwrinkle"], identity: admin }, 1,
    );
    expect(note.kind).toBe("aftercareRecord");
  });

  it("still refuses the platform admin", () => {
    const superAdmin: Identity = { user: { id: "u-priya", name: "Priya" }, role: "superAdmin", context: { kind: "independent" } };
    expect(() => recordAftercareSend(
      patientState(), { patientID: "p1", content: "c", medications: [], categories: [], identity: superAdmin }, 1,
    )).toThrow(BackendError);
  });

  it("throws on a missing patient", () => {
    expect(() => recordAftercareSend(
      emptyState(), { patientID: "px", content: "c", medications: [], categories: [], identity: voss }, 1,
    )).toThrow(BackendError);
  });
});
