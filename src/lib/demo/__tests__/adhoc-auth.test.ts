import { describe, it, expect } from "vitest";
import { requestAdHocAuth, setDoctorStatus, emptyState, BackendError, isoDay, nowFlooredTo10 } from "@/lib/demo/backend";
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

describe("nowFlooredTo10", () => {
  it("floors UTC minute-of-day to the nearest 10", () => {
    expect(nowFlooredTo10(Date.UTC(2026, 6, 1, 14, 37))).toBe(14 * 60 + 30); // 14:37 -> 14:30
  });

  it("agrees with isoDay's UTC date across a local/UTC day boundary", () => {
    // 2026-07-01T02:00:00Z is 2026-07-01T12:00:00+10:00 (AEST) — same UTC calendar day either way,
    // but 2026-07-01T23:00:00Z is 2026-07-02T09:00:00+10:00: local and UTC disagree on the date.
    // atMinute must be computed in the SAME (UTC) frame as isoDay, or the two together describe
    // an inconsistent instant.
    const atBoundary = Date.UTC(2026, 6, 1, 23, 10); // 23:10 UTC on Jul 1
    expect(isoDay(atBoundary)).toBe("2026-07-01");
    expect(nowFlooredTo10(atBoundary)).toBe(23 * 60 + 10); // still Jul 1, 23:10 in the same UTC frame
  });
});
