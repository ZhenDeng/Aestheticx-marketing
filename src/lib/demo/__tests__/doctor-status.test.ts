import { describe, it, expect } from "vitest";
import { doctorStatusForUser, setDoctorStatus, emptyState } from "@/lib/demo/backend";

describe("doctorStatusForUser", () => {
  it("defaults to both false when the doctor has no stored status", () => {
    expect(doctorStatusForUser(emptyState(), "u-voss")).toEqual({ online: false, alwaysAcceptAuth: false });
  });

  it("returns the stored status when present", () => {
    const s = { ...emptyState(), doctorStatusByID: { "u-voss": { online: true, alwaysAcceptAuth: false } } };
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ online: true, alwaysAcceptAuth: false });
  });
});

describe("setDoctorStatus", () => {
  it("merges a single-field patch onto the default when no prior status exists", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ online: true, alwaysAcceptAuth: false });
  });

  it("merges a patch without disturbing the other field", () => {
    let s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    s = setDoctorStatus(s, "u-voss", { alwaysAcceptAuth: true });
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ online: true, alwaysAcceptAuth: true });
  });

  it("does not mutate the input state (immutability)", () => {
    const before = emptyState();
    const after = setDoctorStatus(before, "u-voss", { online: true });
    expect(before.doctorStatusByID).toEqual({});
    expect(after).not.toBe(before);
  });
});
