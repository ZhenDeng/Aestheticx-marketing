import { describe, it, expect } from "vitest";
import {
  emptyState, isoDay, followUpSettingsForUser, setFollowUpSettings,
  followUpTasksForOwnerOn, setFollowUpStatus, BackendError,
} from "@/lib/demo/backend";
import type { FollowUpTask, Identity } from "@/lib/demo/types";

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
