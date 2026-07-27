import { describe, it, expect } from "vitest";
import { appointmentScopesFor, mergeAppointmentRows, missingCallPatientIDs } from "../appointmentsLive";
import type { Appointment } from "@/lib/demo/types";
import type { Row } from "../hydrate";

// Live appointments listeners (16/07 feedback bug 3): the dashboard's "Upcoming
// authorisation calls" must reflect a cancel made on any client without a refresh, so
// appointments get the same per-scope onSnapshot treatment as authRequests — one owner
// scope and one best-effort booker scope per held owner id (uid + each clinic), mirroring
// hydrate's queries exactly (rules are not filters).

function row(id: string, data: Partial<Record<string, unknown>> = {}): Row {
  return {
    id,
    data: {
      type: "authorisation",
      ownerId: "doc-1",
      dateISO: "2026-07-20",
      startMinute: 540,
      endMinute: 550,
      status: "confirmed",
      ...data,
    },
  };
}

describe("appointmentScopesFor", () => {
  it("builds owner + booker scopes for the uid and each clinic", () => {
    const scopes = appointmentScopesFor({ uid: "u1", clinicIds: ["c1"], superAdmin: false });
    expect(scopes.map((s) => s.key)).toEqual(["owner:u1", "booker:u1", "owner:c1", "booker:c1"]);
    expect(scopes.every((s) => s.constraint !== null)).toBe(true);
  });

  it("marks booker scopes optional (rule ships separately — hydrate treats them best-effort)", () => {
    const scopes = appointmentScopesFor({ uid: "u1", clinicIds: [], superAdmin: false });
    expect(scopes.find((s) => s.key === "owner:u1")?.optional).toBeFalsy();
    expect(scopes.find((s) => s.key === "booker:u1")?.optional).toBe(true);
  });

  it("uses one unconstrained scope for a super admin (hydrate parity)", () => {
    const scopes = appointmentScopesFor({ uid: "admin", clinicIds: ["c1"], superAdmin: true });
    expect(scopes).toEqual([{ key: "all", constraint: null }]);
  });
});

describe("mergeAppointmentRows", () => {
  it("unions rows across scopes keyed by id, mapped to Appointment", () => {
    const merged = mergeAppointmentRows({
      "owner:doc-1": [row("a1")],
      "booker:n-1": [row("a2", { ownerId: "doc-2", bookedById: "n-1" })],
    });
    expect(Object.keys(merged).sort()).toEqual(["a1", "a2"]);
    expect(merged.a1.type).toBe("authSlot");
    expect(merged.a1.ownerID).toBe("doc-1");
    expect(merged.a2.bookedByID).toBe("n-1");
  });

  it("dedupes an appointment matching multiple scopes", () => {
    const merged = mergeAppointmentRows({ "owner:u1": [row("a1")], "booker:u1": [row("a1")] });
    expect(Object.keys(merged)).toEqual(["a1"]);
  });

  it("keeps a cancelled appointment so views can drop it live", () => {
    const merged = mergeAppointmentRows({ "owner:u1": [row("a1", { status: "cancelled" })] });
    expect(merged.a1.status).toBe("cancelled");
  });
});

// Consult-call file access (owner feedback 28/07): a call booked while the doctor is already
// signed in grants them the patient's file, but hydrate ran before the booking existed — so
// the listener has to fetch that patient doc, exactly as the requests listener does for an
// open request's reviewer.
describe("missingCallPatientIDs", () => {
  const call = (over: Partial<Appointment> = {}): Appointment => ({
    id: "a1", type: "authSlot", ownerID: "doc-1", bookedByID: "clinic-1",
    dateISO: "2026-07-28", startMinute: 540, endMinute: 550, status: "confirmed",
    patientID: "pat-1", ...over,
  });

  it("lists the patient of a live call the doctor owns and has not loaded", () => {
    expect(missingCallPatientIDs([call()], "doc-1", new Set(), "2026-07-27")).toEqual(["pat-1"]);
  });

  it("skips a patient already in state", () => {
    expect(missingCallPatientIDs([call()], "doc-1", new Set(["pat-1"]), "2026-07-27")).toEqual([]);
  });

  it("skips a call the doctor merely booked for someone else's calendar", () => {
    expect(missingCallPatientIDs([call({ ownerID: "doc-2" })], "doc-1", new Set(), "2026-07-27")).toEqual([]);
  });

  it("skips a call that grants nothing — cancelled, or older than the window", () => {
    expect(missingCallPatientIDs([call({ status: "cancelled" })], "doc-1", new Set(), "2026-07-27")).toEqual([]);
    expect(missingCallPatientIDs([call({ dateISO: "2026-07-20" })], "doc-1", new Set(), "2026-07-27")).toEqual([]);
  });

  it("skips a treatment appointment and a call with no patient linked", () => {
    expect(missingCallPatientIDs([call({ type: "treatment" })], "doc-1", new Set(), "2026-07-27")).toEqual([]);
    expect(missingCallPatientIDs([call({ patientID: undefined })], "doc-1", new Set(), "2026-07-27")).toEqual([]);
  });

  it("asks for each patient once when a doctor has two calls about them", () => {
    expect(missingCallPatientIDs([call(), call({ id: "a2", startMinute: 600 })], "doc-1", new Set(), "2026-07-27"))
      .toEqual(["pat-1"]);
  });
});
