import { describe, it, expect } from "vitest";
import { mergeRequestRows, missingReviewerPatientIDs } from "../requestsLive";
import type { Row } from "../hydrate";
import type { AuthorisationRequest } from "@/lib/demo/types";

// Live authRequests listeners (owner bug 2, 2026-07-13): one snapshot per readable scope
// (nurseId == uid, doctorId == uid, clinicId per claim) merged into state.requests so a
// signed-in doctor sees a nurse's new request without re-authenticating.

function row(id: string, data: Partial<Record<string, unknown>> = {}): Row {
  return {
    id,
    data: {
      patientId: "pat-1",
      nurseId: "nurse-1",
      nurseName: "Nurse One",
      doctorId: "doc-1",
      clinicId: null,
      status: "pending",
      createdAt: 100,
      items: [],
      ...data,
    },
  };
}

describe("mergeRequestRows", () => {
  it("unions rows across scopes keyed by id", () => {
    const merged = mergeRequestRows({
      nurse: [row("r1")],
      doctor: [row("r2", { nurseId: "nurse-2" })],
    });
    expect(Object.keys(merged).sort()).toEqual(["r1", "r2"]);
    expect(merged.r1.doctorID).toBe("doc-1");
    expect(merged.r2.nurse.id).toBe("nurse-2");
  });

  it("dedupes a request that matches multiple scopes", () => {
    const merged = mergeRequestRows({
      nurse: [row("r1")],
      doctor: [row("r1")],
    });
    expect(Object.keys(merged)).toEqual(["r1"]);
  });

  it("keeps a withdrawn request so views can filter it out live", () => {
    const merged = mergeRequestRows({ doctor: [row("r1", { status: "withdrawn" })] });
    expect(merged.r1.status).toBe("withdrawn");
  });
});

describe("missingReviewerPatientIDs", () => {
  const req = (over: Partial<AuthorisationRequest>): AuthorisationRequest => ({
    id: "r1",
    patientID: "pat-1",
    nurse: { id: "nurse-1", name: "Nurse One" },
    doctorID: "doc-1",
    context: { kind: "independent" },
    items: [],
    status: "pending",
    createdAt: 100,
    ...over,
  });

  it("lists open requests addressed to the doctor whose patient is not loaded", () => {
    const ids = missingReviewerPatientIDs([req({})], "doc-1", new Set());
    expect(ids).toEqual(["pat-1"]);
  });

  it("skips patients already in state and requests for other doctors", () => {
    expect(missingReviewerPatientIDs([req({})], "doc-1", new Set(["pat-1"]))).toEqual([]);
    expect(missingReviewerPatientIDs([req({})], "doc-2", new Set())).toEqual([]);
  });

  it("skips closed requests (approved/withdrawn) — reviewer access has lapsed", () => {
    expect(missingReviewerPatientIDs([req({ status: "approved" })], "doc-1", new Set())).toEqual([]);
    expect(missingReviewerPatientIDs([req({ status: "withdrawn" })], "doc-1", new Set())).toEqual([]);
  });

  it("still fetches for a needsEdit request (review stays open)", () => {
    expect(missingReviewerPatientIDs([req({ status: "needsEdit" })], "doc-1", new Set())).toEqual(["pat-1"]);
  });
});
