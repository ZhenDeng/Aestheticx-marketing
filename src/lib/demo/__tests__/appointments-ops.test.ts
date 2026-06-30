import { describe, it, expect } from "vitest";
import {
  emptyState, bookTreatmentAppointment, rescheduleAppointment, markAppointment,
  appointmentsForOwnerOnDay, BackendError,
} from "@/lib/demo/backend";
import type { Appointment, DemoState, Identity } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

const mk = (id: string, ownerID: string, dateISO: string, startMinute: number, status: Appointment["status"]): Appointment =>
  ({ id, type: "treatment", ownerID, dateISO, startMinute, endMinute: startMinute + 30, status });

function withAppts(...a: Appointment[]): DemoState {
  return { ...emptyState(), appointments: Object.fromEntries(a.map((x) => [x.id, x])) };
}

describe("bookTreatmentAppointment", () => {
  it("creates a confirmed treatment appointment owned by the identity scope", () => {
    const { state, appt } = bookTreatmentAppointment(
      emptyState(),
      { dateISO: "2026-06-26", startMinute: 600, durationMinutes: 30, patientID: "p1", patientName: "Mara Boyd", note: "Antiwrinkle", identity: voss },
      Date.UTC(2026, 5, 26),
    );
    expect(appt).toMatchObject({ type: "treatment", status: "confirmed", ownerID: "u-voss", startMinute: 600, endMinute: 630, patientID: "p1", patientName: "Mara Boyd", appointmentNote: "Antiwrinkle" });
    expect(state.appointments[appt.id]).toEqual(appt);
  });
  it("allows a block-time appointment with no patient", () => {
    const { appt } = bookTreatmentAppointment(emptyState(), { dateISO: "2026-06-26", startMinute: 720, durationMinutes: 60, note: "Lunch", identity: voss }, 0);
    expect(appt.patientID).toBeUndefined();
    expect(appt.endMinute).toBe(780);
  });
});

describe("markAppointment", () => {
  it("marks a confirmed appointment no-show", () => {
    const s = markAppointment(withAppts(mk("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", "noShow", voss);
    expect(s.appointments.a1.status).toBe("noShow");
  });
  it("rejects marking a terminal (completed) appointment", () => {
    expect(() => markAppointment(withAppts(mk("a1", "u-voss", "2026-06-26", 600, "completed")), "a1", "noShow", voss)).toThrow(BackendError);
  });
  it("rejects another owner's appointment", () => {
    expect(() => markAppointment(withAppts(mk("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", "completed", sarah)).toThrow(BackendError);
  });
  it("throws on a missing appointment", () => {
    expect(() => markAppointment(emptyState(), "nope", "completed", voss)).toThrow(BackendError);
  });
});

describe("rescheduleAppointment", () => {
  it("moves the appointment and updates the end", () => {
    const s = rescheduleAppointment(withAppts(mk("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", 660, 45, voss);
    expect(s.appointments.a1).toMatchObject({ startMinute: 660, endMinute: 705 });
  });
  it("rejects another owner's appointment", () => {
    expect(() => rescheduleAppointment(withAppts(mk("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", 660, 30, sarah)).toThrow(BackendError);
  });
});

describe("appointmentsForOwnerOnDay", () => {
  it("returns the owner's appointments for the day, excluding cancelled, ordered by start", () => {
    const s = withAppts(
      mk("a1", "u-voss", "2026-06-26", 660, "confirmed"),
      mk("a2", "u-voss", "2026-06-26", 540, "confirmed"),
      mk("a3", "u-voss", "2026-07-03", 600, "confirmed"), // other day
      mk("a4", "u-voss", "2026-06-26", 600, "cancelled"), // cancelled
      mk("a5", "u-sarah", "2026-06-26", 540, "confirmed"), // other owner
    );
    expect(appointmentsForOwnerOnDay(s, "u-voss", "2026-06-26").map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});
