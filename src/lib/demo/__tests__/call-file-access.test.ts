// Consult-call file access (owner feedback 28/07). A clinic books a teleconsult with a
// prescribing doctor ABOUT a patient; until now that granted the doctor nothing, so the
// patient link on their own calendar opened an empty file. The booking now carries the same
// read-only grant an open request does — the demo mirror of the backend's
// onAppointmentWritten trigger.
import { describe, expect, it } from "vitest";
import {
  emptyState, publishAvailability, bookAuthSlot, requestAdHocAuth, setDoctorStatus,
  markAppointment, rescheduleAppointment, patientPermissions, visiblePatients, submitRequest, approveRequest, withdrawRequest,
} from "@/lib/demo/backend";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, MedicationItem, Patient } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const other: Identity = { user: { id: "u-other", name: "Dr Other" }, role: "doctor", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

// NOW is midday on the call's day, in the UTC frame the demo dates its calendar in.
const DAY = "2026-06-26";
const YESTERDAY = "2026-06-25";
const LAST_WEEK = "2026-06-19";
const NOW = Date.parse("2026-06-26T12:00:00Z");

const patient = {
  id: "p1", givenName: "Mara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 4, day: 2 },
  owner: { kind: "clinic", id: LUMIERE.id }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
} as unknown as Patient;

const letybo: MedicationItem = {
  name: "Letybo", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"],
};

function stateWithPatient(): DemoState {
  const base = emptyState();
  return { ...base, patients: { ...base.patients, [patient.id]: patient } };
}

/** The clinic books a slot on the doctor's published window — the real booking path. */
function bookCall(state: DemoState, dateISO = DAY): { state: DemoState; apptID: string } {
  const published = publishAvailability(state, { doctorID: "u-voss", dateISO, startMinute: 540, endMinute: 570 }, voss).state;
  const { state: booked, appt } = bookAuthSlot(published, {
    doctorID: "u-voss", dateISO, startMinute: 540,
    patientID: patient.id, patientName: "Mara Boyd", identity: sarahClinic,
  }, NOW);
  return { state: booked, apptID: appt.id };
}

const canView = (state: DemoState, who: Identity): boolean =>
  patientPermissions(who, state.patients[patient.id]).canView;

describe("consult-call file access", () => {
  it("opens the file to the doctor the call is booked with", () => {
    const { state } = bookCall(stateWithPatient());
    expect(canView(state, voss)).toBe(true);
  });

  it("lists the patient in that doctor's records so the link has somewhere to land", () => {
    const { state } = bookCall(stateWithPatient());
    expect(visiblePatients(state, voss).map((p) => p.id)).toContain(patient.id);
  });

  it("opens the file for an ad-hoc call to an always-accepting doctor", () => {
    const accepting = setDoctorStatus(stateWithPatient(), "u-voss", { alwaysAcceptAuth: true });
    const { state } = requestAdHocAuth(accepting, {
      doctorID: "u-voss", dateISO: DAY, atMinute: 600,
      patientID: patient.id, patientName: "Mara Boyd", identity: sarahClinic,
    }, NOW);
    expect(canView(state, voss)).toBe(true);
  });

  it("grants read-only — the call is not a licence to edit the clinic's file", () => {
    const { state } = bookCall(stateWithPatient());
    const perms = patientPermissions(voss, state.patients[patient.id]);
    expect(perms.canEditDetails).toBe(false);
    expect(perms.canDelete).toBe(false);
  });

  it("closes the file when the doctor completes the call", () => {
    const { state, apptID } = bookCall(stateWithPatient());
    expect(canView(markAppointment(state, apptID, "completed", voss, NOW), voss)).toBe(false);
  });

  it("closes the file when the booking clinic cancels the call", () => {
    const { state, apptID } = bookCall(stateWithPatient());
    expect(canView(markAppointment(state, apptID, "cancelled", sarahClinic, NOW), voss)).toBe(false);
  });

  it("keeps the file open the morning after an evening call", () => {
    const { state } = bookCall(stateWithPatient(), YESTERDAY);
    expect(canView(state, voss)).toBe(true);
  });

  it("closes a call the doctor never marked once it falls out of the window", () => {
    const { state } = bookCall(stateWithPatient(), LAST_WEEK);
    expect(canView(state, voss)).toBe(false);
  });

  it("re-opens the file when a stale call is rescheduled into the window", () => {
    const { state, apptID } = bookCall(stateWithPatient(), LAST_WEEK);
    const moved = rescheduleAppointment(state, apptID, DAY, 540, 10, voss, NOW);
    expect(canView(moved, voss)).toBe(true);
  });

  it("opens nothing to a doctor who is not on the call", () => {
    const { state } = bookCall(stateWithPatient());
    expect(canView(state, other)).toBe(false);
  });

  it("keeps the file open while the call stands, even once the request is closed", () => {
    const { state } = bookCall(stateWithPatient());
    const raised = submitRequest(state, { patientID: patient.id, doctorID: "u-voss", items: [letybo], identity: sarahClinic }, NOW);
    // Withdrawing ends the REQUEST's grant; the booked call still holds the file open.
    const withdrawn = withdrawRequest(raised.state, raised.request.id, sarahClinic, NOW);
    expect(canView(withdrawn, voss)).toBe(true);
  });

  it("leaves an approved prescriber's standing access alone when the call ends", () => {
    const { state, apptID } = bookCall(stateWithPatient());
    const raised = submitRequest(state, { patientID: patient.id, doctorID: "u-voss", items: [letybo], identity: sarahClinic }, NOW);
    const approved = approveRequest(raised.state, raised.request.id, voss, NOW).state;
    const ended = markAppointment(approved, apptID, "completed", voss, NOW);
    expect(canView(ended, voss)).toBe(true); // prescriber now — the call grant is not what holds it
  });
});
