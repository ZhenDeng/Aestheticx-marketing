import { describe, it, expect } from "vitest";
import { isoWeekday } from "@/lib/demo/calendar";
import {
  defaultTreatmentAvailability,
  treatmentAvailabilityForOwner,
  isTimeAvailableForTreatment,
  emptyState,
  setTreatmentDaySchedule,
  addTreatmentBlock,
  removeTreatmentBlock,
  BackendError,
  bookTreatmentAppointment,
  rescheduleAppointment,
  publishAvailability,
  bookAuthSlot,
} from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

describe("isoWeekday", () => {
  it("is 0 for Monday and 6 for Sunday", () => {
    expect(isoWeekday("2026-06-29")).toBe(0); // Monday
    expect(isoWeekday("2026-07-05")).toBe(6); // Sunday
  });
});

describe("defaultTreatmentAvailability", () => {
  it("opens Mon–Fri 09:00–17:00 and closes the weekend", () => {
    const cfg = defaultTreatmentAvailability("u-voss");
    expect(cfg.ownerID).toBe("u-voss");
    expect(cfg.days).toHaveLength(7);
    expect(cfg.days[0]).toEqual({ open: true, openMinute: 540, closeMinute: 1020 }); // Mon
    expect(cfg.days[4].open).toBe(true);   // Fri
    expect(cfg.days[5].open).toBe(false);  // Sat
    expect(cfg.days[6].open).toBe(false);  // Sun
    expect(cfg.blocks).toEqual([]);
  });
});

describe("treatmentAvailabilityForOwner", () => {
  it("returns the default when the owner has none", () => {
    expect(treatmentAvailabilityForOwner(emptyState(), "u-x").days[5].open).toBe(false);
  });
  it("returns the stored config when present", () => {
    const stored = { ...defaultTreatmentAvailability("u-x") };
    stored.days = stored.days.map((d) => ({ ...d, open: true }));
    const s = { ...emptyState(), treatmentAvailabilityByOwner: { "u-x": stored } };
    expect(treatmentAvailabilityForOwner(s, "u-x").days[5].open).toBe(true);
  });
});

describe("isTimeAvailableForTreatment", () => {
  const cfg = defaultTreatmentAvailability("u-x");
  it("accepts a valid weekday time within hours", () => {
    expect(isTimeAvailableForTreatment(cfg, "2026-07-01", 600, 630)).toBe(true); // Wed 10:00
  });
  it("rejects a closed weekday", () => {
    expect(isTimeAvailableForTreatment(cfg, "2026-07-05", 600, 630)).toBe(false); // Sunday
  });
  it("rejects before open / after close", () => {
    expect(isTimeAvailableForTreatment(cfg, "2026-07-01", 480, 540)).toBe(false); // 08:00 start
    expect(isTimeAvailableForTreatment(cfg, "2026-07-01", 1000, 1040)).toBe(false); // ends 17:20
  });
  it("rejects a time overlapping a block, but not a block on another date", () => {
    const blocked = { ...cfg, blocks: [{ id: "b1", dateISO: "2026-07-01", startMinute: 780, endMinute: 840 }] };
    expect(isTimeAvailableForTreatment(blocked, "2026-07-01", 800, 830)).toBe(false); // 13:20 inside block
    expect(isTimeAvailableForTreatment(blocked, "2026-07-02", 800, 830)).toBe(true);  // block is on the 1st
  });
});

describe("treatment-availability mutators", () => {
  it("setTreatmentDaySchedule patches one day, seeding from the default first", () => {
    const s = setTreatmentDaySchedule(emptyState(), "u-x", 6, { open: true, openMinute: 600, closeMinute: 720 });
    const cfg = treatmentAvailabilityForOwner(s, "u-x");
    expect(cfg.days[6]).toEqual({ open: true, openMinute: 600, closeMinute: 720 }); // Sunday now open
    expect(cfg.days[0].open).toBe(true); // Monday still open (default preserved)
  });

  it("addTreatmentBlock mints an id and appends; removeTreatmentBlock deletes it", () => {
    const added = addTreatmentBlock(emptyState(), "u-x", { dateISO: "2026-07-01", startMinute: 780, endMinute: 840 });
    expect(added.block.id).toBeTruthy();
    expect(treatmentAvailabilityForOwner(added.state, "u-x").blocks).toHaveLength(1);
    const removed = removeTreatmentBlock(added.state, "u-x", added.block.id);
    expect(treatmentAvailabilityForOwner(removed, "u-x").blocks).toHaveLength(0);
  });

  it("addTreatmentBlock rejects end <= start", () => {
    expect(() => addTreatmentBlock(emptyState(), "u-x", { dateISO: "2026-07-01", startMinute: 840, endMinute: 780 }))
      .toThrow(BackendError);
  });
});

// Minimal clinician identity owning appointments as their own user id.
const me: Identity = {
  user: { id: "u-x", name: "Dr Doc" },
  role: "doctor",
  context: { kind: "independent" },
};

describe("treatment booking enforcement", () => {
  it("rejects a booking on a closed Sunday", () => {
    expect(() => bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-07-05", startMinute: 600, durationMinutes: 30, identity: me,
    })).toThrow(BackendError);
  });

  it("rejects a booking overlapping a block", () => {
    const s = addTreatmentBlock(emptyState(), "u-x", { dateISO: "2026-07-01", startMinute: 600, endMinute: 660 }).state;
    expect(() => bookTreatmentAppointment(s, {
      dateISO: "2026-07-01", startMinute: 610, durationMinutes: 30, identity: me,
    })).toThrow(BackendError);
  });

  it("accepts a valid weekday booking", () => {
    const { appt } = bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-07-01", startMinute: 600, durationMinutes: 30, identity: me,
    });
    expect(appt.type).toBe("treatment");
  });

  it("rejects a reschedule onto a closed day", () => {
    const { state, appt } = bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-07-01", startMinute: 600, durationMinutes: 30, identity: me,
    });
    expect(() => rescheduleAppointment(state, appt.id, "2026-07-05", 600, 30, me)).toThrow(BackendError);
  });

  it("does not gate a non-treatment (authSlot) reschedule by treatment windows", () => {
    let s = publishAvailability(emptyState(), { doctorID: "u-x", dateISO: "2026-07-01", startMinute: 840, endMinute: 900 }, me).state;
    const booked = bookAuthSlot(s, { doctorID: "u-x", dateISO: "2026-07-01", startMinute: 840, patientID: "p1", patientName: "P One", identity: me });
    s = booked.state;
    // Move the authSlot to a Sunday — treatment windows are closed then, but authSlots are exempt.
    expect(() => rescheduleAppointment(s, booked.appt.id, "2026-07-05", 840, 10, me)).not.toThrow();
  });
});
