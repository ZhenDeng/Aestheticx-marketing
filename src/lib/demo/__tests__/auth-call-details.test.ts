// Consult-call details for the calendar's appointment modal. A booked teleconsult is a
// 10-minute chip — too short for the grid to draw any text — so the modal is the only place
// the call can be read; these are the lines it reads from.
import { describe, expect, it } from "vitest";
import { authCallDetails, emptyState, publishAvailability, bookAuthSlot, submitRequest } from "@/lib/demo/backend";
import { LUMIERE } from "@/lib/demo/accounts";
import type { Appointment, AuthorisationRequest, DemoState, Identity, MedicationItem, Patient } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

const DAY = "2026-06-26";
const NOW = Date.parse("2026-06-26T00:00:00Z");

const patient = {
  id: "p1", givenName: "Mara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 4, day: 2 },
  owner: { kind: "clinic", id: LUMIERE.id },
} as unknown as Patient;

const letybo: MedicationItem = {
  name: "Letybo", dosage: "20 units", category: "neurotoxin", unit: "units", areas: ["Glabella"],
};

function stateWithPatient(): DemoState {
  const base = emptyState();
  return { ...base, patients: { ...base.patients, [patient.id]: patient } };
}

// A slot booked by the clinic nurse against Voss's published window — the real booking path.
function booked(state: DemoState, identity: Identity): { state: DemoState; appt: Appointment } {
  const published = publishAvailability(state, { doctorID: "u-voss", dateISO: DAY, startMinute: 540, endMinute: 570 }, voss).state;
  return bookAuthSlot(published, { doctorID: "u-voss", dateISO: DAY, startMinute: 540, patientID: patient.id, patientName: "Mara Boyd", identity });
}

describe("authCallDetails", () => {
  it("names the booker and the prescriber the call is with", () => {
    const { state, appt } = booked(stateWithPatient(), sarahClinic);
    const details = authCallDetails(state, appt);
    expect(details.bookerName).toBe(LUMIERE.name);
    expect(details.doctorName).toBe("Dr Elena Voss");
  });

  it("drops the auto-generated request marker from the note (the booker line already says it)", () => {
    const { state, appt } = booked(stateWithPatient(), sarah);
    expect(appt.appointmentNote).toBe("Auth request · Sarah Chen");
    expect(authCallDetails(state, appt).note).toBeNull();
  });

  it("keeps a real booking note", () => {
    const { state, appt } = booked(stateWithPatient(), sarah);
    const withNote = { ...appt, appointmentNote: "Antiwrinkle" };
    expect(authCallDetails(state, withNote).note).toBe("Antiwrinkle");
  });

  it("lists the medications on the open request behind the call", () => {
    const { state, appt } = booked(stateWithPatient(), sarahClinic);
    const submitted = submitRequest(state, { patientID: patient.id, doctorID: "u-voss", items: [letybo], identity: sarahClinic }, NOW).state;
    expect(authCallDetails(submitted, appt).medications).toEqual(["Letybo · 20 units"]);
  });

  it("ignores a request addressed to a different doctor", () => {
    const { state, appt } = booked(stateWithPatient(), sarahClinic);
    const submitted = submitRequest(state, { patientID: patient.id, doctorID: "u-other", items: [letybo], identity: sarahClinic }, NOW).state;
    expect(authCallDetails(submitted, appt).medications).toEqual([]);
  });

  it("ignores a request from a different booker", () => {
    const { state, appt } = booked(stateWithPatient(), sarahClinic);
    // Same patient and doctor, but raised by an independent nurse — not the clinic's booking.
    const foreign: AuthorisationRequest = {
      id: "req-foreign", patientID: patient.id, nurse: { id: "u-nadia", name: "Nadia Okafor" },
      doctorID: "u-voss", context: { kind: "independent" }, items: [letybo], status: "pending", createdAt: NOW,
    };
    const withForeign = { ...state, requests: { ...state.requests, [foreign.id]: foreign } };
    expect(authCallDetails(withForeign, appt).medications).toEqual([]);
  });

  it("has nothing to show for a lead booking with no request yet", () => {
    const published = publishAvailability(stateWithPatient(), { doctorID: "u-voss", dateISO: DAY, startMinute: 540, endMinute: 570 }, voss).state;
    const { state, appt } = bookAuthSlot(published, {
      doctorID: "u-voss", dateISO: DAY, startMinute: 540,
      lead: { givenName: "Amy", lastName: "Tran" }, identity: sarahClinic,
    });
    expect(authCallDetails(state, appt).medications).toEqual([]);
  });
});
