// Availability treatment blocks now surface on the calendar (spec: 2026-07-24).
import { describe, expect, it } from "vitest";
import { addTreatmentBlock, treatmentBlocksForOwnerOnDay } from "../backend";
import { buildSeedState } from "../seed";

describe("treatmentBlocksForOwnerOnDay", () => {
  it("returns only the owner's blocks on the given day", () => {
    const seeded = buildSeedState();
    const owner = "u-voss";
    const { state } = addTreatmentBlock(seeded, owner, { dateISO: "2026-07-24", startMinute: 720, endMinute: 780 });
    const { state: state2 } = addTreatmentBlock(state, owner, { dateISO: "2026-07-25", startMinute: 600, endMinute: 660 });
    const today = treatmentBlocksForOwnerOnDay(state2, owner, "2026-07-24");
    expect(today).toHaveLength(1);
    expect(today[0].startMinute).toBe(720);
    expect(treatmentBlocksForOwnerOnDay(state2, "u-other", "2026-07-24")).toHaveLength(0);
  });
});
