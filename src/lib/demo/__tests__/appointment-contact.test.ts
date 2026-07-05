import { describe, expect, it } from "vitest";
import { appointmentContact } from "@/lib/demo/backend";
import type { Appointment, Patient } from "@/lib/demo/types";

const base: Appointment = {
  id: "ap1", type: "authSlot", ownerID: "u-doc", dateISO: "2026-07-09",
  startMinute: 570, endMinute: 600, status: "awaitingConfirmation",
} as unknown as Appointment;

const patient = {
  id: "p1", givenName: "Grace", lastName: "Ho", dateOfBirth: { year: 1988, month: 11, day: 3 },
  phone: "0400 111 222", email: "grace@example.com",
} as unknown as Patient;

describe("appointmentContact", () => {
  it("uses the structured lead, formatting the ISO dob as d/m/yyyy", () => {
    const appt = { ...base, lead: { givenName: "Amy", lastName: "Tran", dob: "1993-02-08", phone: "0400 333 444", email: "amy@example.com" } };
    expect(appointmentContact(appt, undefined)).toEqual({
      dobLabel: "8/2/1993", phone: "0400 333 444", email: "amy@example.com",
    });
  });

  it("omits absent lead fields rather than emitting blanks", () => {
    const appt = { ...base, lead: { givenName: "Amy", lastName: "Tran" } };
    expect(appointmentContact(appt, undefined)).toEqual({});
  });

  it("falls back to the linked patient record", () => {
    const appt = { ...base, patientID: "p1" };
    expect(appointmentContact(appt, patient)).toEqual({
      dobLabel: "3/11/1988", phone: "0400 111 222", email: "grace@example.com",
    });
  });

  it("prefers lead fields over the patient when both exist", () => {
    const appt = { ...base, patientID: "p1", lead: { givenName: "A", lastName: "B", email: "lead@example.com" } };
    expect(appointmentContact(appt, patient).email).toBe("lead@example.com");
  });

  it("returns nothing for blocked time (no lead, no patient)", () => {
    expect(appointmentContact(base, undefined)).toEqual({});
  });
});
