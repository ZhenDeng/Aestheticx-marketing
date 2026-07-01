import { describe, it, expect } from "vitest";
import { requestAdHocAuth, setDoctorStatus, emptyState, BackendError } from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

const me: Identity = {
  user: { id: "u-nurse", name: "Nurse N" },
  role: "nurse",
  context: { kind: "independent" },
} as unknown as Identity;

describe("requestAdHocAuth", () => {
  it("accepts when the doctor is online (even if not always-accepting)", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt).toMatchObject({
      type: "authSlot", ownerID: "u-voss", dateISO: "2026-07-01",
      startMinute: 600, endMinute: 610, status: "confirmed", patientID: "p1", patientName: "Pat One",
    });
  });

  it("accepts when the doctor is always-accepting (even while offline)", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt.status).toBe("confirmed");
  });

  it("rejects when the doctor is neither online nor always-accepting", () => {
    expect(() => requestAdHocAuth(emptyState(), {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    })).toThrow(BackendError);
  });

  it("stamps the appointment note with the requesting nurse's name", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt.appointmentNote).toBe("Auth request · Nurse N");
  });
});
