import { describe, it, expect } from "vitest";
import { doctorStatusForUser, setDoctorStatus, emptyState } from "@/lib/demo/backend";

// 20/07: the transient "I'm online now" flag was removed — ad-hoc acceptance is the single
// standing alwaysAcceptAuth opt-in (the two were OR'd together in every gate).

describe("doctorStatusForUser", () => {
  it("defaults to not accepting when the doctor has no stored status", () => {
    expect(doctorStatusForUser(emptyState(), "u-voss")).toEqual({ alwaysAcceptAuth: false });
  });

  it("returns the stored status when present", () => {
    const s = { ...emptyState(), doctorStatusByID: { "u-voss": { alwaysAcceptAuth: true } } };
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ alwaysAcceptAuth: true });
  });
});

describe("setDoctorStatus", () => {
  it("merges a patch onto the default when no prior status exists", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ alwaysAcceptAuth: true });
  });

  it("switching off is preserved", () => {
    let s = setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
    s = setDoctorStatus(s, "u-voss", { alwaysAcceptAuth: false });
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ alwaysAcceptAuth: false });
  });

  it("does not mutate the input state (immutability)", () => {
    const before = emptyState();
    const after = setDoctorStatus(before, "u-voss", { alwaysAcceptAuth: true });
    expect(before.doctorStatusByID).toEqual({});
    expect(after).not.toBe(before);
  });
});
