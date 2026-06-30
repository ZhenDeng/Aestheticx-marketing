import { describe, it, expect } from "vitest";
import { BOOKING_HOST, bookingLinkUrl } from "@/lib/demo/booking";
import {
  emptyState, bookingTokenForUser, mintBookingToken, pendingBookings, confirmAppointment, BackendError,
} from "@/lib/demo/backend";
import type { Appointment, DemoState, Identity } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

const appt = (id: string, ownerID: string, dateISO: string, startMinute: number, status: Appointment["status"]): Appointment =>
  ({ id, type: "treatment", ownerID, dateISO, startMinute, endMinute: startMinute + 30, status, patientName: "Lead" });

function withAppts(...a: Appointment[]): DemoState {
  return { ...emptyState(), appointments: Object.fromEntries(a.map((x) => [x.id, x])) };
}

describe("booking link", () => {
  it("builds a url from the host + token", () => {
    expect(bookingLinkUrl("bk-1")).toBe(BOOKING_HOST + "bk-1");
  });
});

describe("mintBookingToken", () => {
  it("mints a stable token per user and is idempotent", () => {
    const r1 = mintBookingToken(emptyState(), voss);
    expect(r1.token).toBeTruthy();
    expect(bookingTokenForUser(r1.state, "u-voss")).toBe(r1.token);
    const r2 = mintBookingToken(r1.state, voss); // already minted
    expect(r2.token).toBe(r1.token);
    expect(r2.state).toBe(r1.state); // unchanged reference
  });
  it("gives different users different tokens", () => {
    const a = mintBookingToken(emptyState(), voss);
    const b = mintBookingToken(a.state, sarah);
    expect(b.token).not.toBe(a.token);
  });
});

describe("pendingBookings", () => {
  it("lists the owner's awaiting-confirmation bookings across dates, earliest first", () => {
    const s = withAppts(
      appt("a1", "u-voss", "2026-07-10", 600, "awaitingConfirmation"),
      appt("a2", "u-voss", "2026-07-03", 540, "awaitingConfirmation"),
      appt("a3", "u-voss", "2026-07-03", 600, "confirmed"),          // confirmed — excluded
      appt("a4", "u-sarah", "2026-07-01", 540, "awaitingConfirmation"), // other owner — excluded
    );
    expect(pendingBookings(s, "u-voss").map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});

describe("confirmAppointment", () => {
  it("confirms the owner's booking", () => {
    const s = confirmAppointment(withAppts(appt("a1", "u-voss", "2026-07-03", 600, "awaitingConfirmation")), "a1", voss);
    expect(s.appointments.a1.status).toBe("confirmed");
  });
  it("rejects another owner's booking", () => {
    expect(() => confirmAppointment(withAppts(appt("a1", "u-voss", "2026-07-03", 600, "awaitingConfirmation")), "a1", sarah)).toThrow(BackendError);
  });
  it("throws on a missing appointment", () => {
    expect(() => confirmAppointment(emptyState(), "nope", voss)).toThrow(BackendError);
  });
  it("rejects re-confirming an already-confirmed booking", () => {
    expect(() => confirmAppointment(withAppts(appt("a1", "u-voss", "2026-07-03", 600, "confirmed")), "a1", voss)).toThrow(BackendError);
  });
});
