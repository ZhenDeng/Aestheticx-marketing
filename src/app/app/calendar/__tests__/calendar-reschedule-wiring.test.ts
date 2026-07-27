// Finding 4 (27/07 review): six of the eight calendar reschedule sites are drag/resize pointer
// handlers, and the month-chip drag is the seventh/eighth pair — jsdom has no layout and no
// pointer capture, so a behavioural test can't drive any of them. This is a SOURCE-SHAPE test,
// not a behavioural one: it reads page.tsx as text and checks the textual shape of every call
// site instead of executing it. That's a deliberate, narrower guarantee than a real test — it
// would pass even if `promptNotify` were a no-op stub — but it does catch the one regression
// this feature is actually at risk of: a new store.rescheduleAppointment( call site added later
// (a ninth drag path, a new bulk-move feature, ...) that forgets to also call promptNotify(),
// silently reintroducing the "moved a block, client never told" bug this whole feature fixed.
// The expected count is asserted explicitly so adding an unwired call site fails loudly instead
// of just not being counted.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Repo-relative (not import.meta.url-relative): vitest's transform pipeline doesn't always
// hand this file a proper file:// URL, so `new URL("../page.tsx", import.meta.url)` throws.
const PAGE_PATH = join(process.cwd(), "src/app/app/calendar/page.tsx");
const RESCHEDULE_CALL = "store.rescheduleAppointment(";
const PROMPT_CALL = "promptNotify(";
const LOOKAHEAD_LINES = 3;

describe("calendar page — every rescheduleAppointment call is paired with promptNotify", () => {
  it("finds exactly 8 wired call sites", () => {
    const lines = readFileSync(PAGE_PATH, "utf8").split("\n");
    const callSiteLineNumbers: number[] = [];

    lines.forEach((line, i) => {
      if (line.includes(RESCHEDULE_CALL)) callSiteLineNumbers.push(i);
    });

    // Pin the count so a NEW unwired call site (or a deleted one) fails this test instead of
    // silently changing what "every site" means.
    expect(callSiteLineNumbers).toHaveLength(8);

    for (const i of callSiteLineNumbers) {
      const window = lines.slice(i, i + 1 + LOOKAHEAD_LINES).join("\n");
      expect(
        window.includes(PROMPT_CALL),
        `store.rescheduleAppointment( at page.tsx:${i + 1} has no promptNotify( within ${LOOKAHEAD_LINES} lines:\n${window}`,
      ).toBe(true);
    }
  });
});
