import { describe, it, expect } from "vitest";
import {
  emptyState, slotsForWindow, publishAvailability, availabilityWindowsForDoctor,
  doctorsWithAvailability, isSlotTaken, openSlotsForDoctorOnDay, withdrawAvailability,
  bookAuthSlot, requestAdHocAuth, BackendError, setDoctorStatus,
} from "@/lib/demo/backend";
import type { Appointment, DemoState, Identity } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const DAY = "2026-06-26";
function withWindow(): DemoState {
  return publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, endMinute: 570 }, voss).state;
}

describe("slotsForWindow", () => {
  it("yields 10-minute start slots", () => {
    expect(slotsForWindow({ id: "w", doctorID: "d", doctorName: "D", dateISO: DAY, startMinute: 540, endMinute: 570 })).toEqual([540, 550, 560]);
  });
  it("drops a trailing partial slot", () => {
    expect(slotsForWindow({ id: "w", doctorID: "d", doctorName: "D", dateISO: DAY, startMinute: 540, endMinute: 565 })).toEqual([540, 550]);
  });
});

describe("publishAvailability", () => {
  it("a doctor publishes their own window, stamping the doctor name", () => {
    const { window } = publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, endMinute: 600 }, voss);
    expect(window).toMatchObject({ doctorID: "u-voss", doctorName: "Dr Elena Voss", dateISO: DAY, startMinute: 540, endMinute: 600 });
  });
  it("rejects a non-doctor", () => {
    expect(() => publishAvailability(emptyState(), { doctorID: "u-sarah", dateISO: DAY, startMinute: 540, endMinute: 600 }, sarah)).toThrow(BackendError);
  });
  it("rejects publishing for another doctor", () => {
    expect(() => publishAvailability(emptyState(), { doctorID: "u-other", dateISO: DAY, startMinute: 540, endMinute: 600 }, voss)).toThrow(BackendError);
  });
  it("rejects an end at or before the start", () => {
    expect(() => publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: DAY, startMinute: 600, endMinute: 600 }, voss)).toThrow(BackendError);
  });
});

describe("availabilityWindowsForDoctor / doctorsWithAvailability", () => {
  it("lists a doctor's windows and the distinct doctors", () => {
    const s = withWindow();
    expect(availabilityWindowsForDoctor(s, "u-voss")).toHaveLength(1);
    expect(doctorsWithAvailability(s)).toEqual([
      { doctorID: "u-voss", doctorName: "Dr Elena Voss", hasSlots: true, online: false, alwaysAcceptAuth: false },
    ]);
  });

  it("includes an online-only doctor with no published windows", () => {
    const s = setDoctorStatus(emptyState(), "u-online", { online: true });
    expect(doctorsWithAvailability(s)).toEqual([
      { doctorID: "u-online", doctorName: "", hasSlots: false, online: true, alwaysAcceptAuth: false },
    ]);
  });

  it("includes an always-accept-only doctor with no published windows", () => {
    const s = setDoctorStatus(emptyState(), "u-always", { alwaysAcceptAuth: true });
    expect(doctorsWithAvailability(s)).toEqual([
      { doctorID: "u-always", doctorName: "", hasSlots: false, online: false, alwaysAcceptAuth: true },
    ]);
  });

  it("merges all criteria for one doctor into a single entry", () => {
    let s = publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: "2026-07-01", startMinute: 540, endMinute: 570 }, voss).state;
    s = setDoctorStatus(s, "u-voss", { online: true, alwaysAcceptAuth: true });
    const result = doctorsWithAvailability(s);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ doctorID: "u-voss", hasSlots: true, online: true, alwaysAcceptAuth: true });
  });

  it("excludes a doctor satisfying no criteria", () => {
    expect(doctorsWithAvailability(emptyState())).toEqual([]);
  });
});

describe("isSlotTaken / openSlotsForDoctorOnDay", () => {
  it("removes taken slots from the open list and ignores cancelled", () => {
    let s = withWindow(); // slots 540,550,560
    s = bookAuthSlot(s, { doctorID: "u-voss", dateISO: DAY, startMinute: 550, patientID: "p1", patientName: "Mara Boyd", identity: sarah }).state;
    expect(isSlotTaken(s, "u-voss", DAY, 550)).toBe(true);
    expect(openSlotsForDoctorOnDay(s, "u-voss", DAY)).toEqual([540, 560]);
    // a cancelled auth slot frees the time again
    const cancelled: Appointment = { id: "x", type: "authSlot", ownerID: "u-voss", dateISO: DAY, startMinute: 560, endMinute: 570, status: "cancelled" };
    s = { ...s, appointments: { ...s.appointments, x: cancelled } };
    expect(isSlotTaken(s, "u-voss", DAY, 560)).toBe(false);
  });
});

describe("bookAuthSlot", () => {
  it("creates a 10-minute authSlot appointment owned by the doctor", () => {
    const { appt } = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "Mara Boyd", identity: sarah });
    expect(appt).toMatchObject({ type: "authSlot", ownerID: "u-voss", dateISO: DAY, startMinute: 540, endMinute: 550, status: "confirmed", patientID: "p1", patientName: "Mara Boyd" });
  });
  it("rejects a slot that is not within any published window", () => {
    expect(() => bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 700, patientID: "p1", patientName: "X", identity: sarah })).toThrow(BackendError);
  });
  it("rejects a double-book of the same slot", () => {
    const s = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "A", identity: sarah }).state;
    expect(() => bookAuthSlot(s, { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p2", patientName: "B", identity: sarah })).toThrow(BackendError);
  });
  it("rejects a slot overlapping an unaligned ad-hoc authorisation appointment (parity with deployed bookAuthSlot)", () => {
    // An ad-hoc request isn't on the slot grid: 545–555 straddles the 540 and 550 slots.
    let s = setDoctorStatus(withWindow(), "u-voss", { online: true });
    s = requestAdHocAuth(s, { doctorID: "u-voss", dateISO: DAY, atMinute: 545, patientID: "p1", patientName: "A", identity: sarah }).state;
    expect(() => bookAuthSlot(s, { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p2", patientName: "B", identity: sarah })).toThrow("slotTaken");
    expect(() => bookAuthSlot(s, { doctorID: "u-voss", dateISO: DAY, startMinute: 550, patientID: "p2", patientName: "B", identity: sarah })).toThrow("slotTaken");
    // The next slot only touches (555 < 560): bookable.
    expect(bookAuthSlot(s, { doctorID: "u-voss", dateISO: DAY, startMinute: 560, patientID: "p2", patientName: "B", identity: sarah }).appt.startMinute).toBe(560);
  });
});

describe("withdrawAvailability", () => {
  it("removes an empty window", () => {
    const s = withWindow();
    const id = Object.keys(s.availabilityWindows)[0];
    expect(Object.keys(withdrawAvailability(s, id, voss).availabilityWindows)).toHaveLength(0);
  });
  it("rejects withdrawing a window that has a booking", () => {
    let s = withWindow();
    const id = Object.keys(s.availabilityWindows)[0];
    s = bookAuthSlot(s, { doctorID: "u-voss", dateISO: DAY, startMinute: 550, patientID: "p1", patientName: "A", identity: sarah }).state;
    expect(() => withdrawAvailability(s, id, voss)).toThrow(BackendError);
  });
  it("rejects another user withdrawing", () => {
    const s = withWindow();
    const id = Object.keys(s.availabilityWindows)[0];
    expect(() => withdrawAvailability(s, id, sarah)).toThrow(BackendError);
  });
});
