import { describe, it, expect } from "vitest";
import { requestAdHocAuth, setDoctorStatus, emptyState, BackendError, isoDay, nowFlooredTo10, isPastSlot } from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

const me: Identity = {
  user: { id: "u-nurse", name: "Nurse N" },
  role: "nurse",
  context: { kind: "independent" },
} as unknown as Identity;

describe("requestAdHocAuth", () => {
  it("accepts when the doctor is always-accepting", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt).toMatchObject({
      type: "authSlot", ownerID: "u-voss", dateISO: "2026-07-01",
      startMinute: 600, endMinute: 610, status: "confirmed", patientID: "p1", patientName: "Pat One",
    });
  });

  it("accepts regardless of published slots or treatment hours", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt.status).toBe("confirmed");
  });

  it("rejects when the doctor is not always-accepting", () => {
    expect(() => requestAdHocAuth(emptyState(), {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    })).toThrow(BackendError);
  });

  it("stamps the appointment note with the requesting nurse's name", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt.appointmentNote).toBe("Auth request · Nurse N");
  });
});

describe("requestAdHocAuth — auth-overlap rule (parity with deployed adHocAuthTx)", () => {
  const accepting = () => setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
  const request = (s: ReturnType<typeof emptyState>, atMinute: number, doctorID = "u-voss", dateISO = "2026-07-01") =>
    requestAdHocAuth(s, { doctorID, dateISO, atMinute, patientID: "p1", patientName: "Pat One", identity: me });

  it("rejects a request overlapping an existing authorisation appointment", () => {
    const s = request(accepting(), 615).state; // 615–625
    expect(() => request(s, 620)).toThrow("slotTaken"); // 620–630 overlaps
    expect(() => request(s, 610)).toThrow("slotTaken"); // 610–620 overlaps from below
  });

  it("allows a touching (adjacent, non-overlapping) request", () => {
    const s = request(accepting(), 615).state; // 615–625
    expect(request(s, 625).appt.startMinute).toBe(625);
  });

  it("ignores cancelled authorisation appointments", () => {
    const first = request(accepting(), 615);
    const cancelled = {
      ...first.state,
      appointments: { [first.appt.id]: { ...first.appt, status: "cancelled" as const } },
    };
    expect(request(cancelled, 620).appt.startMinute).toBe(620);
  });

  it("ignores treatment appointments (auth may overlap treatment) and other doctors/days", () => {
    let s = accepting();
    s = {
      ...s,
      appointments: {
        t1: { id: "t1", type: "treatment" as const, ownerID: "u-voss", dateISO: "2026-07-01", startMinute: 615, endMinute: 625, status: "confirmed" as const },
      },
    };
    s = setDoctorStatus(s, "u-khan", { alwaysAcceptAuth: true });
    s = request(s, 615, "u-khan").state;              // other doctor, same time — fine
    s = request(s, 615, "u-voss", "2026-07-02").state; // other day — fine
    expect(request(s, 615).appt.startMinute).toBe(615); // over the treatment appt — allowed
  });
});

describe("isPastSlot", () => {
  // 2026-07-01T14:37Z — "now" floors to slot 14:30 on 2026-07-01 (UTC frame throughout).
  const now = Date.UTC(2026, 6, 1, 14, 37);

  it("is true for an earlier date", () => {
    expect(isPastSlot("2026-06-30", 23 * 60 + 50, now)).toBe(true);
  });

  it("is false for a later date, even at midnight", () => {
    expect(isPastSlot("2026-07-02", 0, now)).toBe(false);
  });

  it("is true for today at an earlier minute", () => {
    expect(isPastSlot("2026-07-01", 14 * 60 + 20, now)).toBe(true);
  });

  it("is false for today's current floored slot (a 'now' request is never past)", () => {
    expect(isPastSlot("2026-07-01", 14 * 60 + 30, now)).toBe(false);
  });

  it("is false for today at a later minute", () => {
    expect(isPastSlot("2026-07-01", 14 * 60 + 40, now)).toBe(false);
  });

  it("stays in the UTC frame near a day boundary", () => {
    // 23:10 UTC on Jul 1 — at UTC+10 the local date is already Jul 2, but the app's
    // dateISO/minute coordinates are UTC (isoDay/nowFlooredTo10), so Jul 1 23:10 is "now",
    // not past, and Jul 2 00:00 is the future.
    const boundary = Date.UTC(2026, 6, 1, 23, 10);
    expect(isPastSlot("2026-07-01", 23 * 60 + 10, boundary)).toBe(false);
    expect(isPastSlot("2026-07-01", 23 * 60, boundary)).toBe(true);
    expect(isPastSlot("2026-07-02", 0, boundary)).toBe(false);
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
