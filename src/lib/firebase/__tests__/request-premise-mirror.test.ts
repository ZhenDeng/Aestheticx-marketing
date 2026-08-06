import { describe, it, expect, vi, beforeEach } from "vitest";

// The live edit paths write authRequests directly (updateDoc). firestore.rules admits
// 'premise' in the affected keys only from the 06/08 rules deploy, so the mirror must send it
// ONLY when the caller re-stamped — writing it unconditionally would put it in affectedKeys on
// every items-only edit and fail for any session still on the old rules.

const updateDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  setDoc: vi.fn(),
  doc: (_db: unknown, coll: string, id: string) => `${coll}/${id}`,
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  deleteField: vi.fn(),
  increment: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock("@/lib/firebase/client", () => ({ firestore: () => ({}), functions: () => ({}), storage: () => ({}) }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => vi.fn() }));

import { mirrorEditPendingRequest, mirrorResubmitRequest } from "@/lib/firebase/mirror";
import type { MedicationItem } from "@/lib/demo/types";

const items: MedicationItem[] = [
  { name: "Letybo", dosage: "20", unit: "units", route: "intramuscular", category: "neurotoxin", areas: [] },
];
const PREMISE = { id: "p-city", name: "City rooms", address: "2 City Rd, Sydney NSW 2000" };

beforeEach(() => updateDoc.mockReset());

describe("live edit paths carry a re-stamped premise", () => {
  it("edit-in-place writes the premise when one is supplied", async () => {
    await mirrorEditPendingRequest("r-1", items, PREMISE);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ premise: PREMISE });
  });

  it("edit-in-place omits the premise key entirely when none is supplied", async () => {
    await mirrorEditPendingRequest("r-1", items);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty("premise");
  });

  it("resubmit writes the premise alongside the status flip", async () => {
    await mirrorResubmitRequest("r-1", items, PREMISE);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ status: "pending", premise: PREMISE });
  });

  it("resubmit omits the premise key when none is supplied", async () => {
    await mirrorResubmitRequest("r-1", items);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty("premise");
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ status: "pending" });
  });
});
