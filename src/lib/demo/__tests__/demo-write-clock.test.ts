import { describe, it, expect } from "vitest";
import { createDemoWriteClock, SEED_NOW, buildSeedState } from "@/lib/demo/seed";
import { isoDay, recordAftercareSend, notesForPatient } from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

// 18/07: every seeded record is stamped SEED_NOW, and the demo store stamped its WRITES with
// SEED_NOW too. Array#sort is stable, so a fresh record tied with the seed and lost the
// tie-break to it — a note you just created rendered BELOW the sample data. Most visibly, a
// new "Queued" aftercare send landed next to the seeded "Failed" one, reading as a failed send.

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };

describe("demo write clock", () => {
  it("stamps every write strictly after the seed", () => {
    const clock = createDemoWriteClock();
    expect(clock()).toBeGreaterThan(SEED_NOW);
  });

  it("is strictly increasing, so writes keep their creation order", () => {
    const clock = createDemoWriteClock();
    const stamps = [clock(), clock(), clock()];
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(new Set(stamps).size).toBe(3);
  });

  it("gives each provider its own sequence rather than sharing module state", () => {
    expect(createDemoWriteClock()()).toBe(createDemoWriteClock()());
  });

  // The demo's "today" is SEED_NOW's day: seeded appointments are keyed to isoDay(SEED_NOW)
  // and authorisation expiry is measured from it. Advancing the write clock must not drift
  // off that day, or the sandbox's calendar would silently disagree with its own seed.
  it("stays within the seed's day even after many writes", () => {
    const clock = createDemoWriteClock();
    let last = SEED_NOW;
    for (let i = 0; i < 10_000; i++) last = clock();
    expect(isoDay(last)).toBe(isoDay(SEED_NOW));
  });
});

describe("demo write clock — ordering against seeded data", () => {
  it("puts a freshly sent aftercare note above the seeded failed one", () => {
    const clock = createDemoWriteClock();
    const seeded = buildSeedState();
    // p-1 is Amara, who carries the seeded failed-aftercare record.
    const before = notesForPatient(seeded, "p-1");
    expect(before.some((n) => n.deliveryStatus === "failed")).toBe(true);

    const { state } = recordAftercareSend(
      seeded, { patientID: "p-1", content: "Fresh send", medications: [], categories: [], identity: voss }, clock(),
    );
    const after = notesForPatient(state, "p-1");
    expect(after[0].body).toBe("Fresh send");
    expect(after[0].deliveryStatus).toBe("queued");
  });

  it("would regress if writes reused SEED_NOW — the seeded note wins the tie", () => {
    // Pins the exact failure mode: same stamp as the seed => stable sort keeps the seed first.
    const { state } = recordAftercareSend(
      buildSeedState(), { patientID: "p-1", content: "Fresh send", medications: [], categories: [], identity: voss }, SEED_NOW,
    );
    expect(notesForPatient(state, "p-1")[0].body).not.toBe("Fresh send");
  });
});
