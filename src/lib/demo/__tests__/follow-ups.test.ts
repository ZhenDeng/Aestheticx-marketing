import { describe, it, expect } from "vitest";
import {
  emptyState, isoDay, followUpSettingsForUser, setFollowUpSettings,
  followUpTasksForOwnerOn, setFollowUpStatus, BackendError,
  saveTreatmentNote, setFollowUpSettings as setFU,
  appointmentReminderForUser, setAppointmentReminder,
  presetDays, followUpIntervalForCategories, readFollowUpSettings,
} from "@/lib/demo/backend";
import { encodeFollowUpTask, mapFollowUpTask } from "@/lib/firebase/mappers";
import type { Authorisation, DemoState, FollowUpTask, Identity, Patient, ProductCategory } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

const task = (id: string, ownerID: string, dueDateISO: string, status: FollowUpTask["status"] = "pending"): FollowUpTask =>
  ({ id, ownerID, patientID: "p1", patientName: "Pat One", dueDateISO, status });

function withTasks(...tasks: FollowUpTask[]) {
  return { ...emptyState(), followUpTasksByID: Object.fromEntries(tasks.map((t) => [t.id, t])) };
}

describe("isoDay", () => {
  it("formats epoch ms as yyyy-MM-dd in UTC", () => {
    expect(isoDay(Date.UTC(2026, 5, 26, 23, 30))).toBe("2026-06-26");
  });
});

describe("follow-up settings", () => {
  it("defaults to disabled / 2-week preset", () => {
    expect(followUpSettingsForUser(emptyState(), "u-voss")).toEqual({ enabled: false, preset: "2wk", intervalDays: 14 });
  });
  it("stores per-user settings and normalises intervalDays to the global preset (Tier 3 #2)", () => {
    const s = setFollowUpSettings(emptyState(), { enabled: true, preset: "2mo", intervalDays: 0 }, voss);
    expect(followUpSettingsForUser(s, "u-voss")).toEqual({ enabled: true, preset: "2mo", intervalDays: 60 }); // 0 → derived 60
    expect(followUpSettingsForUser(s, "u-sarah")).toEqual({ enabled: false, preset: "2wk", intervalDays: 14 });
  });
  it("derives intervalDays from a custom day count (clamped 1–90)", () => {
    const s = setFollowUpSettings(emptyState(), { enabled: true, preset: "custom", customDays: 200, intervalDays: 0 }, voss);
    expect(followUpSettingsForUser(s, "u-voss").intervalDays).toBe(90); // clamped
  });
});

describe("follow-up interval presets + per-treatment (Tier 3 #2)", () => {
  it("maps named presets to days; custom clamps 1–90", () => {
    expect(presetDays("2wk")).toBe(14);
    expect(presetDays("2mo")).toBe(60);
    expect(presetDays("4mo")).toBe(120);
    expect(presetDays("6mo")).toBe(180);
    expect(presetDays("custom", 30)).toBe(30);
    expect(presetDays("custom", 0)).toBe(1);
    expect(presetDays("custom", 999)).toBe(90);
  });
  it("resolves a per-treatment override, else the global preset", () => {
    const s = { enabled: true, preset: "2wk" as const, perTreatment: { haFiller: "6mo" as const }, intervalDays: 14 };
    expect(followUpIntervalForCategories(s, [])).toBe(14); // no ticked auth → global
    expect(followUpIntervalForCategories(s, ["haFiller"])).toBe(180); // override
    expect(followUpIntervalForCategories(s, ["neurotoxin"])).toBe(14); // no override → global
  });
  it("takes the SHORTEST interval across multiple categories (earliest follow-up)", () => {
    const s = { enabled: true, preset: "6mo" as const, perTreatment: { neurotoxin: "2wk" as const, haFiller: "4mo" as const }, intervalDays: 180 };
    expect(followUpIntervalForCategories(s, ["haFiller", "neurotoxin"])).toBe(14); // min(120, 14)
  });
});

describe("readFollowUpSettings — migration + decode (Tier 3 #2)", () => {
  it("decodes a new-model doc", () => {
    expect(readFollowUpSettings({ followUpEnabled: true, followUpPreset: "4mo", followUpPerTreatment: { neurotoxin: "2wk", junk: "x", haFiller: "bad" } }))
      .toEqual({ enabled: true, preset: "4mo", customDays: undefined, perTreatment: { neurotoxin: "2wk" }, intervalDays: 120 });
  });
  it("migrates a legacy followUpIntervalDays-only doc to a preset", () => {
    expect(readFollowUpSettings({ followUpEnabled: true, followUpIntervalDays: 14 }))
      .toMatchObject({ enabled: true, preset: "2wk", intervalDays: 14 });
    expect(readFollowUpSettings({ followUpEnabled: true, followUpIntervalDays: 60 }))
      .toMatchObject({ preset: "2mo", intervalDays: 60 });
    expect(readFollowUpSettings({ followUpEnabled: true, followUpIntervalDays: 21 }))
      .toMatchObject({ preset: "custom", customDays: 21, intervalDays: 21 }); // non-preset → custom
  });
  it("returns null when the doc carries no follow-up fields", () => {
    expect(readFollowUpSettings({ someOther: 1 })).toBeNull();
  });
});

describe("appointment reminder settings (Tier 3 #1)", () => {
  it("defaults to 0 (no reminder)", () => {
    expect(appointmentReminderForUser(emptyState(), "u-voss")).toBe(0);
  });
  it("stores the lead time per user", () => {
    const s = setAppointmentReminder(emptyState(), 2, voss);
    expect(appointmentReminderForUser(s, "u-voss")).toBe(2);
    expect(appointmentReminderForUser(s, "u-sarah")).toBe(0); // untouched user still defaults
  });
  it("overwrites a prior lead time (immutably)", () => {
    const s1 = setAppointmentReminder(emptyState(), 1, voss);
    const s2 = setAppointmentReminder(s1, 0, voss);
    expect(appointmentReminderForUser(s2, "u-voss")).toBe(0);
    expect(appointmentReminderForUser(s1, "u-voss")).toBe(1); // s1 not mutated
  });
});

describe("followUpTasksForOwnerOn", () => {
  it("returns the owner's pending tasks due on or before the date, oldest first", () => {
    const s = withTasks(
      task("t1", "u-voss", "2026-06-20"),
      task("t2", "u-voss", "2026-06-26"),
      task("t3", "u-voss", "2026-06-30"),          // future — excluded
      task("t4", "u-voss", "2026-06-25", "done"),  // actioned — excluded
      task("t5", "u-sarah", "2026-06-20"),         // other owner — excluded
    );
    expect(followUpTasksForOwnerOn(s, "u-voss", "2026-06-26").map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("setFollowUpStatus", () => {
  it("updates the owner's own task", () => {
    const s = setFollowUpStatus(withTasks(task("t1", "u-voss", "2026-06-20")), "t1", "done", voss);
    expect(s.followUpTasksByID.t1.status).toBe("done");
  });
  it("rejects another user's task", () => {
    expect(() => setFollowUpStatus(withTasks(task("t1", "u-voss", "2026-06-20")), "t1", "done", sarah)).toThrow(BackendError);
  });
  it("throws on a missing task", () => {
    expect(() => setFollowUpStatus(emptyState(), "nope", "done", voss)).toThrow(BackendError);
  });
});

function patientState(): DemoState {
  const p: Patient = {
    id: "p1", givenName: "Claire", lastName: "Donovan", dateOfBirth: { year: 1987, month: 7, day: 4 },
    gender: "Female", address: "", phone: "0432", email: "c@e.com", allergies: "NKDA",
    currentMedications: "Nil", owner: { kind: "doctor", id: "u-voss" }, prescribingDoctorIDs: [],
  };
  return { ...emptyState(), patients: { p1: p } };
}

describe("saveTreatmentNote follow-up generation", () => {
  const NOW = Date.UTC(2026, 5, 26);
  const auth = (id: string, category: ProductCategory): Authorisation => ({
    id, requestID: "r", patientID: "p1", doctorID: "u-voss", nurseID: "u-voss", clinicID: null,
    medication: { name: "X", dosage: "1", category, unit: "millilitres", areas: [] },
    repeatsRemaining: 5, expiresAt: NOW + 9_999_999_999, createdAt: NOW, invoiced: false,
  });

  it("schedules a follow-up at now + the global preset when enabled (no ticked auth)", () => {
    let state = patientState();
    state = setFU(state, { enabled: true, preset: "2wk", intervalDays: 14 }, voss);
    const r = saveTreatmentNote(state, { patientID: "p1", tickedIDs: [], title: "", body: "Tx", medications: [], identity: voss }, NOW);
    expect(r.followUp).toBeDefined();
    expect(r.followUp!.dueDateISO).toBe("2026-07-10"); // 26 Jun + 14 days (2wk)
    expect(r.followUp!.sourceNoteID).toBe(r.note.id);
    expect(followUpTasksForOwnerOn(r.state, "u-voss", "2026-07-10").map((t) => t.id)).toEqual([r.followUp!.id]);
  });

  it("uses the per-treatment interval keyed on the consumed authorisation's category", () => {
    let state = patientState();
    state = { ...state, authorisations: { a1: auth("a1", "haFiller") } };
    state = setFU(state, { enabled: true, preset: "2wk", perTreatment: { haFiller: "6mo" }, intervalDays: 14 }, voss);
    const r = saveTreatmentNote(state, { patientID: "p1", tickedIDs: ["a1"], title: "", body: "Tx", medications: [], identity: voss }, NOW);
    // haFiller → 6mo (180d) overrides the 2-week global. 26 Jun 2026 + 180 = 23 Dec 2026.
    expect(r.followUp!.dueDateISO).toBe("2026-12-23");
  });
  it("schedules nothing when disabled", () => {
    const state = patientState();
    const r = saveTreatmentNote(state, { patientID: "p1", tickedIDs: [], title: "", body: "Tx", medications: [], identity: voss }, NOW);
    expect(r.followUp).toBeUndefined();
    expect(Object.keys(r.state.followUpTasksByID)).toHaveLength(0);
  });
});

describe("follow-up mapper", () => {
  it("round-trips (ownerID comes from the path, not the body)", () => {
    const t: FollowUpTask = { id: "fu1", ownerID: "u-voss", patientID: "p1", patientName: "Pat One", dueDateISO: "2026-07-10", status: "pending", sourceNoteID: "n1" };
    const doc = encodeFollowUpTask(t);
    expect(doc).toMatchObject({ patientId: "p1", patientName: "Pat One", dueDateISO: "2026-07-10", status: "pending", sourceNoteId: "n1" });
    expect(mapFollowUpTask("fu1", "u-voss", doc)).toEqual(t);
  });
  it("defaults an unknown status to pending", () => {
    expect(mapFollowUpTask("fu1", "u-voss", { patientId: "p1", patientName: "P", dueDateISO: "2026-07-10", status: "weird" }).status).toBe("pending");
  });
});
