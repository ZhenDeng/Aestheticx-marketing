import { describe, it, expect } from "vitest";
import {
  emptyState, slotsForWindow, publishAvailability, availabilityWindowsForDoctor,
  doctorsWithAvailability, isSlotTaken, openSlotsForDoctorOnDay, withdrawAvailability,
  bookAuthSlot, requestAdHocAuth, BackendError, setDoctorStatus,
  appointmentsForOwnerOnDay, appointmentsForOwnerInRange, appointmentOwnerScope,
  canRescheduleAppointment, rescheduleAppointment, upcomingAuthCalls,
  appointmentChipTitle, bookerLabel,
} from "@/lib/demo/backend";
import { LUMIERE } from "@/lib/demo/accounts";
import type { Appointment, DemoState, Identity } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

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

// Tier-2: a booked auth slot must also appear on the BOOKING nurse's / clinic's calendar, not just
// the doctor's — via a bookedByID participant field. Mutation stays owner-only (read-only for the nurse).
describe("auth slot calendar visibility (bookedByID)", () => {
  it("appointmentOwnerScope resolves clinic context to the clinic id, else the user id", () => {
    expect(appointmentOwnerScope(sarah)).toBe("u-sarah");
    expect(appointmentOwnerScope(sarahClinic)).toBe(LUMIERE.id);
  });

  it("bookAuthSlot stamps bookedByID with the nurse's scope (independent → user id)", () => {
    const { appt } = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "A", identity: sarah });
    expect(appt.ownerID).toBe("u-voss");
    expect(appt.bookedByID).toBe("u-sarah");
  });

  it("bookAuthSlot stamps bookedByID with the clinic id when booked in a clinic context", () => {
    const { appt } = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "A", identity: sarahClinic });
    expect(appt.bookedByID).toBe(LUMIERE.id);
  });

  it("requestAdHocAuth stamps bookedByID with the booker's scope", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    const { appt } = requestAdHocAuth(s, { doctorID: "u-voss", dateISO: DAY, atMinute: 600, patientID: "p1", patientName: "A", identity: sarah });
    expect(appt.bookedByID).toBe("u-sarah");
  });

  it("shows the auth slot on the doctor's AND the booking nurse's calendar, not an unrelated viewer's", () => {
    const s = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "A", identity: sarah }).state;
    expect(appointmentsForOwnerOnDay(s, "u-voss", DAY)).toHaveLength(1);   // doctor (owner)
    expect(appointmentsForOwnerOnDay(s, "u-sarah", DAY)).toHaveLength(1);  // booking nurse (booker)
    expect(appointmentsForOwnerOnDay(s, "u-other", DAY)).toHaveLength(0);  // unrelated viewer
    expect(appointmentsForOwnerInRange(s, "u-sarah", DAY, DAY)).toHaveLength(1);
  });

  // 15/07 feedback: the booking nurse/clinic may now reschedule/cancel the auth slot they booked
  // (the doctor still owns and also manages it; it's one shared record so the change syncs both ways).
  it("is reschedulable by the owner AND by the booking nurse", () => {
    const { appt } = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "A", identity: sarah });
    expect(canRescheduleAppointment(appt, "u-voss")).toBe(true);   // doctor owns it
    expect(canRescheduleAppointment(appt, "u-sarah")).toBe(true);  // nurse booked it → may manage it
    expect(canRescheduleAppointment(appt, "u-other")).toBe(false); // unrelated viewer cannot
  });

  it("lets the booking nurse reschedule the doctor's auth slot", () => {
    const s = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "A", identity: sarah }).state;
    const id = Object.keys(s.appointments)[0];
    const moved = rescheduleAppointment(s, id, DAY, 560, 10, sarah);
    expect(moved.appointments[id]).toMatchObject({ startMinute: 560, endMinute: 570 });
  });
});

describe("upcomingAuthCalls (round 6 doctor schedule)", () => {
  const NOON = Date.UTC(2026, 5, 26, 12, 0); // "now": 12:00 on DAY, UTC frame like isoDay
  function booked(state: DemoState, dateISO: string, startMinute: number): DemoState {
    const published = publishAvailability(state, { doctorID: "u-voss", dateISO, startMinute, endMinute: startMinute + 30 }, voss).state;
    return bookAuthSlot(published, { doctorID: "u-voss", dateISO, startMinute, patientID: "p1", patientName: "Amara Boyd", identity: sarah }).state;
  }

  it("lists confirmed future authSlot appointments chronologically", () => {
    let s = booked(emptyState(), "2026-06-27", 540);
    s = booked(s, DAY, 800); // later today (13:20)
    const calls = upcomingAuthCalls(s, "u-voss", NOON);
    expect(calls.map((a) => [a.dateISO, a.startMinute])).toEqual([[DAY, 800], ["2026-06-27", 540]]);
    expect(calls[0].appointmentNote).toBe("Auth request · Sarah Chen");
  });

  it("hides finished calls, other doctors' calls, and non-auth appointments", () => {
    let s = booked(emptyState(), DAY, 540); // 09:00–09:10, already past at noon
    s = booked(s, "2026-06-27", 540);
    const other: Appointment = {
      id: "x", type: "authSlot", ownerID: "u-else", dateISO: "2026-06-27", startMinute: 540,
      endMinute: 550, status: "confirmed",
    };
    const treatment: Appointment = {
      id: "t", type: "treatment", ownerID: "u-voss", dateISO: "2026-06-27", startMinute: 600,
      endMinute: 660, status: "confirmed",
    };
    s = { ...s, appointments: { ...s.appointments, [other.id]: other, [treatment.id]: treatment } };
    const calls = upcomingAuthCalls(s, "u-voss", NOON);
    expect(calls.map((a) => a.dateISO)).toEqual(["2026-06-27"]);
    expect(calls[0].type).toBe("authSlot");
  });

  // 16/07 feedback bug 3 (calendar↔dashboard sync contract): the dashboard list and the
  // calendar mutate the SAME appointment record, so a cancel or complete from either
  // surface must drop the call from the upcoming list.
  it("drops a call the moment it is cancelled or completed", () => {
    const s = booked(emptyState(), "2026-06-27", 540);
    const id = Object.keys(s.appointments)[0];
    const cancelled = { ...s, appointments: { ...s.appointments, [id]: { ...s.appointments[id], status: "cancelled" as const } } };
    expect(upcomingAuthCalls(cancelled, "u-voss", NOON)).toEqual([]);
    const completed = { ...s, appointments: { ...s.appointments, [id]: { ...s.appointments[id], status: "completed" as const } } };
    expect(upcomingAuthCalls(completed, "u-voss", NOON)).toEqual([]);
  });
});

describe("authSlot chip title (14/07: 'nurse/clinic – patient – teleconsult')", () => {
  it("titles a nurse-booked slot with the booker, patient and teleconsult marker", () => {
    const s = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "Amara Boyd", identity: sarah }).state;
    const appt = Object.values(s.appointments)[0];
    expect(bookerLabel(s, appt)).toBe("Sarah Chen");
    expect(appointmentChipTitle(s, appt)).toBe("Sarah Chen – Amara Boyd – teleconsult");
  });
  it("labels a clinic-context booking with the clinic", () => {
    const s = bookAuthSlot(withWindow(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: "p1", patientName: "Amara Boyd", identity: sarahClinic }).state;
    const appt = Object.values(s.appointments)[0];
    expect(appointmentChipTitle(s, appt)).toBe(`${LUMIERE.name} – Amara Boyd – teleconsult`);
  });
  it("falls back to the legacy 'Auth request · X' note when bookedByID is unresolvable", () => {
    const legacy: Appointment = {
      id: "x", type: "authSlot", ownerID: "u-voss", dateISO: DAY, startMinute: 540, endMinute: 550,
      status: "confirmed", patientID: "p1", patientName: "Amara Boyd", appointmentNote: "Auth request · Janet Wang",
    };
    expect(bookerLabel(emptyState(), legacy)).toBe("Janet Wang");
    expect(appointmentChipTitle(emptyState(), legacy)).toBe("Janet Wang – Amara Boyd – teleconsult");
  });
  it("leaves non-auth appointments on the patient/lead title", () => {
    const treatment: Appointment = {
      id: "t", type: "treatment", ownerID: "u-voss", dateISO: DAY, startMinute: 600, endMinute: 660,
      status: "confirmed", patientID: "p2", patientName: "Coco Donovan",
    };
    expect(appointmentChipTitle(emptyState(), treatment)).toBe("Coco Donovan");
    expect(appointmentChipTitle(emptyState(), { ...treatment, patientID: undefined, patientName: undefined }, "Blocked time")).toBe("Blocked time");
  });
  it("marks Google-ingested bookings so staff can tell them from in-app ones", () => {
    const booked: Appointment = {
      id: "g", type: "treatment", ownerID: "u-voss", dateISO: DAY, startMinute: 600, endMinute: 630,
      status: "confirmed", patientID: "p2", patientName: "Coco Donovan",
      source: "google", externalCalendarRef: { provider: "google", eventId: "gevt-1" },
    };
    expect(appointmentChipTitle(emptyState(), booked)).toBe("Coco Donovan · Google");
    // In-app appointments (source manual or absent) are unmarked.
    expect(appointmentChipTitle(emptyState(), { ...booked, source: "manual" })).toBe("Coco Donovan");
    expect(appointmentChipTitle(emptyState(), { ...booked, source: undefined })).toBe("Coco Donovan");
  });
});
