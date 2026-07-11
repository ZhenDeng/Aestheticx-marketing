import { describe, it, expect } from "vitest";
import { FirebaseError } from "firebase/app";
import { assembleState, notesRowsForPatient, type HydrationRows } from "@/lib/firebase/hydrate";

const rows: HydrationRows = {
  patients: [
    { id: "p1", data: { ownerType: "clinic", ownerId: "clinic-lumiere", givenName: "Amara", lastName: "Boyd", dateOfBirth: "1991-03-12", prescribingDoctorIds: [] } },
  ],
  notesByPatient: { p1: [{ id: "n1", data: { kind: "general", body: "hi", createdAt: 1 } }] },
  authorisations: [
    { id: "a1", data: { requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah", clinicId: "clinic-lumiere", repeatsRemaining: 4, expiresAtMillis: 1800000000000, medication: { name: "Letybo", category: "neurotoxin", unit: "units", areas: ["Forehead"] } } },
  ],
  requests: [
    { id: "r2", data: { patientId: "p1", nurseId: "u-sarah", nurseName: "Sarah Chen", doctorId: "u-voss", status: "pending", createdAt: 2, items: [] } },
  ],
  appointments: [
    { id: "ap1", data: { type: "treatment", ownerId: "clinic-lumiere", dateISO: "2026-06-26", startMinute: 540, endMinute: 570, status: "confirmed" } },
  ],
  formsByPatient: { p1: [{ id: "fm1", data: { template: "antiwrinkleConsent", channel: "onDevice", signedAt: 3, intro: "i", clauses: ["c"], answers: [] } }] },
  invoices: [{ id: "inv1", data: { doctorId: "u-voss", counterpartyId: "clinic-lumiere", counterpartyType: "clinic", periodLabel: "June 2026", lines: [{ authorisationId: "a1", dateISO: "2026-06-26", patientName: "Mara", feeCents: 2500, gstCents: 250 }], subtotalCents: 2500, gstCents: 250, totalCents: 2750, authorisationIds: ["a1"], pdfFileId: "invoices/u-voss/inv1.pdf", createdAt: 6 } }],
  scriptPricing: [{ id: "u-voss_clinic-lumiere", data: { doctorId: "u-voss", counterpartyId: "clinic-lumiere", priceCents: 3000 } }],
  noteTemplates: [{ id: "tpl1", data: { ownerId: "u-voss", name: "Std", body: "Body", aftercareCategories: ["antiwrinkle"] } }],
  followUpTasks: [{ id: "fu1", data: { patientId: "p1", patientName: "Pat", dueDateISO: "2026-07-10", status: "pending" } }],
  followUpSettings: { enabled: true, preset: "custom", customDays: 7, intervalDays: 7 },
  appointmentReminderLead: null,
  bookingToken: "bk-voss",
  doctorStatus: { online: false, alwaysAcceptAuth: false },
  profile: { ahpra: "MED0001234567", abn: "82 601 443 218", phone: "0412 884 209", address: "14 Acland St, St Kilda VIC", avatarFileId: "users/u-voss/avatar.jpg" },
  currentUserID: "u-voss",
};

describe("assembleState", () => {
  it("builds a DemoState keyed by id with nested notes", () => {
    const state = assembleState(rows);
    expect(Object.keys(state.patients)).toEqual(["p1"]);
    expect(state.notesByPatient.p1).toHaveLength(1);
    expect(state.authorisations.a1.repeatsRemaining).toBe(4);
    expect(state.requests.r2.status).toBe("pending");
    expect(state.appointments.ap1.startMinute).toBe(540);
    expect(state.invoices).toHaveLength(1);
    expect(state.invoices[0].totalCents).toBe(2750);
    expect(state.scriptPricing["u-voss_clinic-lumiere"]).toBe(3000);
    expect(state.usages).toEqual([]);
    expect(state.formsByPatient.p1).toHaveLength(1);
    expect(state.noteTemplatesByOwner["u-voss"]).toHaveLength(1);
    expect(state.noteTemplatesByOwner["u-voss"][0]).toMatchObject({ name: "Std", aftercareCategories: ["antiwrinkle"] });
    expect(state.followUpTasksByID.fu1).toMatchObject({ ownerID: "u-voss", dueDateISO: "2026-07-10", status: "pending" });
    expect(state.followUpSettingsByUser["u-voss"]).toEqual({ enabled: true, preset: "custom", customDays: 7, intervalDays: 7 });
    expect(state.bookingTokensByUser["u-voss"]).toBe("bk-voss");
  });

  it("maps emergency authorisations into emergencyAuthorisationsByID (empty when none)", () => {
    expect(assembleState(rows).emergencyAuthorisationsByID).toEqual({});
    const state = assembleState({
      ...rows,
      emergencyAuthorisations: [
        { id: "p1_u-voss_adrenaline", data: { patientId: "p1", doctorId: "u-voss", doctorName: "Dr Elena Voss", kind: "adrenaline", nurseId: "u-sarah", clinicId: "clinic-lumiere", createdAt: 100, refreshedAt: 200, expiresAtMillis: 1800000000000, sourceAuthorisationIds: ["a1"] } },
      ],
    });
    expect(state.emergencyAuthorisationsByID["p1_u-voss_adrenaline"]).toMatchObject({
      patientID: "p1", doctorID: "u-voss", doctorName: "Dr Elena Voss", kind: "adrenaline",
      createdAt: 100, refreshedAt: 200, expiresAt: 1800000000000, sourceAuthorisationIDs: ["a1"],
    });
  });

  it("maps auditLog rows into auditLogByID (empty when the super-admin path didn't read it)", () => {
    expect(assembleState(rows).auditLogByID).toEqual({});
    const state = assembleState({
      ...rows,
      auditLog: [
        { id: "au1", data: { actorId: "u-admin", actorName: "Priya Nair", actorRole: "superAdmin", action: "admin_patient_access", targetType: "patient", targetId: "p1", summary: "opened Amara Boyd", at: 1700 } },
      ],
    });
    expect(state.auditLogByID.au1).toMatchObject({
      actorID: "u-admin", actorName: "Priya Nair", actorRole: "superAdmin",
      action: "admin_patient_access", targetType: "patient", targetID: "p1", summary: "opened Amara Boyd", at: 1700,
    });
  });

  it("omits follow-up settings + booking token when the user doc carries neither", () => {
    const state = assembleState({ ...rows, followUpSettings: null, appointmentReminderLead: null, bookingToken: null });
    expect(state.followUpSettingsByUser).toEqual({});
    expect(state.bookingTokensByUser).toEqual({});
    expect(state.appointmentReminderByUser).toEqual({});
  });

  it("keys the appointment-reminder lead time under the current user (Tier 3 #1)", () => {
    const state = assembleState({ ...rows, appointmentReminderLead: 2 });
    expect(state.appointmentReminderByUser).toEqual({ "u-voss": 2 });
    // 0 (explicitly off) is still recorded, distinct from absent
    expect(assembleState({ ...rows, appointmentReminderLead: 0 }).appointmentReminderByUser).toEqual({ "u-voss": 0 });
  });

  it("keys the users/{uid} profile fields under the current user", () => {
    const state = assembleState(rows);
    expect(state.profileByUser["u-voss"]).toEqual({
      ahpra: "MED0001234567", abn: "82 601 443 218", phone: "0412 884 209",
      address: "14 Acland St, St Kilda VIC", avatarFileId: "users/u-voss/avatar.jpg",
    });
  });

  it("leaves profileByUser empty when the users/{uid} doc is missing", () => {
    const state = assembleState({ ...rows, profile: null });
    expect(state.profileByUser).toEqual({});
  });
});

describe("notesRowsForPatient (rules-are-not-filters fallback)", () => {
  const denied = new FirebaseError("permission-denied", "Missing or insufficient permissions.");
  const gen = { id: "n-gen", data: { kind: "general", authorId: "other" } };
  const tx = { id: "n-tx", data: { kind: "treatment", authorId: "other" } };
  const ownGen = { id: "n-own", data: { kind: "general", authorId: "me" } };

  it("returns the unconstrained list when the wide read is allowed (full-access viewer)", async () => {
    const q = async () => [gen, tx];
    expect(await notesRowsForPatient("patients/p1/notes", "me", q)).toEqual([gen, tx]);
  });

  it("on denial, unions treatment + own-authored notes (deduped)", async () => {
    const q = async (_path: string, filter?: { field: string; value: string }) => {
      if (!filter) throw denied;                       // wide list denied
      if (filter.field === "kind") return [tx];        // provable
      if (filter.field === "authorId") return [ownGen, tx]; // own notes (overlaps tx)
      return [];
    };
    const rowsOut = await notesRowsForPatient("patients/p1/notes", "me", q);
    expect(rowsOut.map((r) => r.id).sort()).toEqual(["n-own", "n-tx"]); // deduped, no n-gen
  });

  it("degrades the own-authored query to empty when its grant isn't deployed yet", async () => {
    const q = async (_path: string, filter?: { field: string; value: string }) => {
      if (!filter) throw denied;
      if (filter.field === "kind") return [tx];
      throw denied; // authorId branch not in the deployed rules yet
    };
    expect((await notesRowsForPatient("patients/p1/notes", "me", q)).map((r) => r.id)).toEqual(["n-tx"]);
  });

  it("rethrows a transient error on the wide read (fail loud, not a silent reduced set)", async () => {
    const q = async () => { throw new FirebaseError("unavailable", "backend blip"); };
    await expect(notesRowsForPatient("patients/p1/notes", "me", q)).rejects.toThrow("backend blip");
  });

  it("rethrows a transient error on the treatment fallback query", async () => {
    const q = async (_path: string, filter?: { field: string; value: string }) => {
      if (!filter) throw denied;
      throw new FirebaseError("unavailable", "treatment blip");
    };
    await expect(notesRowsForPatient("patients/p1/notes", "me", q)).rejects.toThrow("treatment blip");
  });
});
