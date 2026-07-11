import { describe, it, expect } from "vitest";
import {
  emptyState, isoDay, followUpSettingsForUser, setFollowUpSettings,
  followUpTasksForOwnerOn, setFollowUpStatus, BackendError,
  saveTreatmentNote, setFollowUpSettings as setFU,
  appointmentReminderForUser, setAppointmentReminder,
} from "@/lib/demo/backend";
import { encodeFollowUpTask, mapFollowUpTask } from "@/lib/firebase/mappers";
import type { DemoState, FollowUpTask, Identity, Patient } from "@/lib/demo/types";

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
  it("defaults to disabled / 14 days", () => {
    expect(followUpSettingsForUser(emptyState(), "u-voss")).toEqual({ enabled: false, intervalDays: 14 });
  });
  it("stores per-user settings", () => {
    const s = setFollowUpSettings(emptyState(), { enabled: true, intervalDays: 7 }, voss);
    expect(followUpSettingsForUser(s, "u-voss")).toEqual({ enabled: true, intervalDays: 7 });
    expect(followUpSettingsForUser(s, "u-sarah")).toEqual({ enabled: false, intervalDays: 14 });
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
  it("schedules a follow-up at now+interval when enabled", () => {
    let state = patientState();
    state = setFU(state, { enabled: true, intervalDays: 14 }, voss);
    const r = saveTreatmentNote(state, { patientID: "p1", tickedIDs: [], title: "", body: "Tx", medications: [], identity: voss }, NOW);
    expect(r.followUp).toBeDefined();
    expect(r.followUp!.dueDateISO).toBe("2026-07-10"); // 26 Jun + 14 days
    expect(r.followUp!.sourceNoteID).toBe(r.note.id);
    expect(r.followUp!.ownerID).toBe("u-voss");
    expect(followUpTasksForOwnerOn(r.state, "u-voss", "2026-07-10").map((t) => t.id)).toEqual([r.followUp!.id]);
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
