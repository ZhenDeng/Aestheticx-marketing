import { describe, expect, it } from "vitest";
import { doctorRequestStats, rankDoctors, mostRecentlyRequestedDoctor } from "@/lib/demo/doctorRanking";
import type { AuthorisationRequest } from "@/lib/demo/types";

type Doctor = { doctorId: string; doctorName: string };
const docs: Doctor[] = [
  { doctorId: "d-ava", doctorName: "Ava" },
  { doctorId: "d-ben", doctorName: "Ben" },
  { doctorId: "d-cara", doctorName: "Cara" },
];

// Minimal request shape (only nurse.id, doctorID, createdAt matter here).
function req(nurseID: string, doctorID: string, createdAt: number): AuthorisationRequest {
  return { id: `r-${doctorID}-${createdAt}`, patientID: "p", nurse: { id: nurseID, name: "N" }, doctorID, context: { kind: "independent" }, items: [], status: "pending", createdAt } as unknown as AuthorisationRequest;
}

describe("doctorRequestStats", () => {
  it("counts only the given nurse's requests, tracking the latest timestamp", () => {
    const requests = [
      req("nurse-1", "d-ben", 100), req("nurse-1", "d-ben", 300),
      req("nurse-1", "d-ava", 200),
      req("nurse-2", "d-ava", 999), // other nurse — ignored
    ];
    const stats = doctorRequestStats(requests, "nurse-1");
    expect(stats.get("d-ben")).toEqual({ count: 2, lastAt: 300 });
    expect(stats.get("d-ava")).toEqual({ count: 1, lastAt: 200 });
    expect(stats.has("d-cara")).toBe(false);
  });
});

describe("rankDoctors", () => {
  it("orders by request count desc, then recency, then name; never-requested to the bottom", () => {
    const requests = [
      req("n", "d-cara", 10), req("n", "d-cara", 20), req("n", "d-cara", 30), // 3
      req("n", "d-ben", 50), // 1, most recent
      req("n", "d-ava", 40),  // 1, older
    ];
    const stats = doctorRequestStats(requests, "n");
    const ranked = rankDoctors(docs, stats).map((d) => d.doctorId);
    // Cara (3) first; Ben vs Ava tie on count(1) → Ben more recent (50 > 40); then any count-0 by name.
    expect(ranked).toEqual(["d-cara", "d-ben", "d-ava"]);
  });

  it("puts unrequested doctors alphabetically at the bottom", () => {
    const requests = [req("n", "d-cara", 10)];
    const stats = doctorRequestStats(requests, "n");
    expect(rankDoctors(docs, stats).map((d) => d.doctorId)).toEqual(["d-cara", "d-ava", "d-ben"]);
  });

  it("is a stable alphabetical order with no history", () => {
    expect(rankDoctors(docs, new Map()).map((d) => d.doctorId)).toEqual(["d-ava", "d-ben", "d-cara"]);
  });
});

describe("mostRecentlyRequestedDoctor", () => {
  it("returns the doctor with the latest request that is still available", () => {
    const stats = doctorRequestStats([req("n", "d-ava", 40), req("n", "d-ben", 50)], "n");
    expect(mostRecentlyRequestedDoctor(stats, ["d-ava", "d-ben", "d-cara"])).toBe("d-ben");
  });

  it("skips a most-recent doctor no longer in the list", () => {
    const stats = doctorRequestStats([req("n", "d-ava", 40), req("n", "d-gone", 99)], "n");
    expect(mostRecentlyRequestedDoctor(stats, ["d-ava", "d-ben"])).toBe("d-ava");
  });

  it("returns null with no usable history", () => {
    expect(mostRecentlyRequestedDoctor(new Map(), ["d-ava"])).toBeNull();
  });

  it("breaks an exact-timestamp tie deterministically (count, then lower id)", () => {
    // Same lastAt for both; d-ben has more requests → wins regardless of Map order.
    const tie = new Map([
      ["d-ava", { count: 1, lastAt: 500 }],
      ["d-ben", { count: 3, lastAt: 500 }],
    ]);
    expect(mostRecentlyRequestedDoctor(tie, ["d-ava", "d-ben"])).toBe("d-ben");
    // Same lastAt AND count → lower id wins, independent of insertion order.
    const tie2 = new Map([
      ["d-ben", { count: 2, lastAt: 500 }],
      ["d-ava", { count: 2, lastAt: 500 }],
    ]);
    expect(mostRecentlyRequestedDoctor(tie2, ["d-ava", "d-ben"])).toBe("d-ava");
  });
});
