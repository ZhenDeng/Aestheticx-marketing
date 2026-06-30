import { describe, it, expect } from "vitest";
import {
  emptyState, bookTreatmentAppointment, rescheduleAppointment, markAppointment,
  appointmentsForOwnerOnDay, appointmentsForOwnerInRange, appointmentsForPatient, BackendError,
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
    );
    expect(appt).toMatchObject({ type: "treatment", status: "confirmed", ownerID: "u-voss", startMinute: 600, endMinute: 630, patientID: "p1", patientName: "Mara Boyd", appointmentNote: "Antiwrinkle" });
    expect(state.appointments[appt.id]).toEqual(appt);
  });
  it("allows a block-time appointment with no patient", () => {
    const { appt } = bookTreatmentAppointment(emptyState(), { dateISO: "2026-06-26", startMinute: 720, durationMinutes: 60, note: "Lunch", identity: voss });
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
  it("rejects rescheduling a terminal (completed) appointment", () => {
    expect(() => rescheduleAppointment(withAppts(mk("a1", "u-voss", "2026-06-26", 600, "completed")), "a1", 660, 30, voss)).toThrow(BackendError);
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

describe("appointmentsForOwnerInRange", () => {
  it("returns the owner's appointments within inclusive bounds, cancelled excluded, sorted by date then start", () => {
    const s = withAppts(
      mk("a1", "u-voss", "2026-06-29", 540, "confirmed"),
      mk("a2", "u-voss", "2026-06-29", 480, "confirmed"), // same day, earlier
      mk("a3", "u-voss", "2026-06-26", 600, "confirmed"), // start bound (inclusive)
      mk("a4", "u-voss", "2026-07-02", 600, "confirmed"), // end bound (inclusive)
      mk("a5", "u-voss", "2026-06-25", 600, "confirmed"), // before range
      mk("a6", "u-voss", "2026-07-03", 600, "confirmed"), // after range
      mk("a7", "u-voss", "2026-06-29", 700, "cancelled"), // cancelled
      mk("a8", "u-sarah", "2026-06-29", 540, "confirmed"), // other owner
    );
    expect(appointmentsForOwnerInRange(s, "u-voss", "2026-06-26", "2026-07-02").map((a) => a.id))
      .toEqual(["a3", "a2", "a1", "a4"]);
  });
});

describe("appointmentsForPatient", () => {
  const pk = (id: string, patientID: string | undefined, dateISO: string, startMinute: number, status: Appointment["status"]): Appointment =>
    ({ id, type: "treatment", ownerID: "u-voss", dateISO, startMinute, endMinute: startMinute + 30, status, patientID });

  it("returns only the patient's appointments, newest-first across dates and within a day, all statuses", () => {
    const s = withAppts(
      pk("a1", "p1", "2026-06-26", 540, "completed"),
      pk("a2", "p1", "2026-07-03", 600, "noShow"),
      pk("a3", "p1", "2026-07-03", 480, "cancelled"), // same day as a2, earlier
      pk("a4", "p2", "2026-07-10", 600, "confirmed"), // other patient
      pk("a5", undefined, "2026-07-09", 600, "confirmed"), // a lead / no patient
    );
    expect(appointmentsForPatient(s, "p1").map((a) => a.id)).toEqual(["a2", "a3", "a1"]);
  });
  it("is empty when the patient has no appointments", () => {
    expect(appointmentsForPatient(withAppts(), "p1")).toEqual([]);
  });
});
