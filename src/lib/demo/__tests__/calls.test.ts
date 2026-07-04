import { describe, it, expect } from "vitest";
import { incomingCallFromSignal, callDisplayName } from "@/lib/demo/calls";
import { recordCalledDoctor, mostRecentlyCalledDoctor, defaultDoctorID, emptyState } from "@/lib/demo/backend";

const NOW = Date.UTC(2026, 6, 4, 10, 0);

describe("incomingCallFromSignal", () => {
  const valid = {
    calleeId: "u-voss",
    room: "req-r1",
    requestId: "r1",
    callerName: "Sarah Chen",
    patientName: "Mara Boyd",
    expiresAtMillis: NOW + 30_000,
  };

  it("parses a live signal doc", () => {
    expect(incomingCallFromSignal(valid, NOW)).toEqual({
      requestID: "r1", room: "req-r1", callerName: "Sarah Chen", patientName: "Mara Boyd",
    });
  });

  it("derives the room from the request id when missing or empty", () => {
    expect(incomingCallFromSignal({ ...valid, room: "" }, NOW)?.room).toBe("req-r1");
    const { room: _room, ...noRoom } = valid;
    expect(incomingCallFromSignal(noRoom, NOW)?.room).toBe("req-r1");
  });

  it("drops an expired signal (a stale doc must not raise a phantom ring)", () => {
    expect(incomingCallFromSignal({ ...valid, expiresAtMillis: NOW }, NOW)).toBeNull();
    expect(incomingCallFromSignal({ ...valid, expiresAtMillis: NOW - 1 }, NOW)).toBeNull();
  });

  it("treats a missing expiry as expired (never ring forever)", () => {
    const { expiresAtMillis: _e, ...noExpiry } = valid;
    expect(incomingCallFromSignal(noExpiry, NOW)).toBeNull();
  });

  it("rejects a payload without a request id", () => {
    expect(incomingCallFromSignal({ ...valid, requestId: "" }, NOW)).toBeNull();
    const { requestId: _r, ...noReq } = valid;
    expect(incomingCallFromSignal(noReq, NOW)).toBeNull();
  });

  it("rejects a push-shaped payload whose kind is not a call", () => {
    expect(incomingCallFromSignal({ ...valid, kind: "booking" }, NOW)).toBeNull();
    // But the signal-doc shape (no kind at all) parses — only the push payload carries kind.
    expect(incomingCallFromSignal({ ...valid, kind: "call" }, NOW)).not.toBeNull();
  });

  it("falls back caller name and normalises empty patient to undefined (iOS parity)", () => {
    expect(incomingCallFromSignal({ ...valid, callerName: "" }, NOW)?.callerName).toBe("Incoming call");
    expect(incomingCallFromSignal({ ...valid, patientName: "" }, NOW)?.patientName).toBeUndefined();
    expect(incomingCallFromSignal({ ...valid, patientName: null }, NOW)?.patientName).toBeUndefined();
  });
});

describe("callDisplayName", () => {
  it("joins caller and patient like iOS CallKit display", () => {
    expect(callDisplayName("Sarah Chen", "Mara Boyd")).toBe("Sarah Chen · Mara Boyd");
  });
  it("is the caller alone when no patient is known", () => {
    expect(callDisplayName("Sarah Chen", undefined)).toBe("Sarah Chen");
    expect(callDisplayName("Sarah Chen", "")).toBe("Sarah Chen");
  });
});

describe("recordCalledDoctor / mostRecentlyCalledDoctor", () => {
  it("is null before any call", () => {
    expect(mostRecentlyCalledDoctor(emptyState(), "u-sarah")).toBeNull();
  });

  it("records and reads back the called doctor", () => {
    const s = recordCalledDoctor(emptyState(), "u-sarah", "u-voss");
    expect(mostRecentlyCalledDoctor(s, "u-sarah")).toBe("u-voss");
  });

  it("latest call wins", () => {
    let s = recordCalledDoctor(emptyState(), "u-sarah", "u-voss");
    s = recordCalledDoctor(s, "u-sarah", "u-khan");
    expect(mostRecentlyCalledDoctor(s, "u-sarah")).toBe("u-khan");
  });

  it("is per-user", () => {
    const s = recordCalledDoctor(emptyState(), "u-sarah", "u-voss");
    expect(mostRecentlyCalledDoctor(s, "u-ruby")).toBeNull();
  });

  it("does not mutate the previous state", () => {
    const before = emptyState();
    recordCalledDoctor(before, "u-sarah", "u-voss");
    expect(mostRecentlyCalledDoctor(before, "u-sarah")).toBeNull();
  });
});

describe("defaultDoctorID", () => {
  const doctors = [{ doctorID: "u-khan" }, { doctorID: "u-voss" }];

  it("prefers the most-recently-called doctor when they are in the list", () => {
    expect(defaultDoctorID(doctors, "u-voss")).toBe("u-voss");
  });

  it("falls back to the first doctor when the recent one is not pickable", () => {
    expect(defaultDoctorID(doctors, "u-gone")).toBe("u-khan");
  });

  it("falls back to the first doctor when no call was ever made", () => {
    expect(defaultDoctorID(doctors, null)).toBe("u-khan");
  });

  it("is null when there are no doctors", () => {
    expect(defaultDoctorID([], "u-voss")).toBeNull();
  });
});
