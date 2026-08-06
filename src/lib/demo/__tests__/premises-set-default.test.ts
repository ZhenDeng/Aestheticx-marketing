import { describe, it, expect } from "vitest";
import { premisesAfterSetDefault, premisesAfterSave, premisesAfterDelete, activePremise } from "@/lib/demo/backend";
import type { UserProfile } from "@/lib/demo/types";

// Owner feedback 06/08: "the default address cannot be changed". Confirmed — defaultPremiseId
// was written in exactly two places (the FIRST premise ever saved, and the repoint after a
// delete), so the "Default" badge was pinned to whichever premise happened to be created first
// and no reducer or control could move it. Selecting a row only ever set selectedPremiseId.

const A = { id: "p-a", name: "Bondi rooms", address: "1 A St, Bondi NSW 2026" };
const B = { id: "p-b", name: "Surry rooms", address: "2 B St, Surry Hills NSW 2010" };

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  ahpra: "", abn: "", phone: "", address: "", principalPlace: "",
  premises: [A, B], defaultPremiseId: A.id, selectedPremiseId: A.id,
  ...over,
} as UserProfile);

describe("premisesAfterSetDefault", () => {
  it("moves the default to another premise", () => {
    expect(premisesAfterSetDefault(profile(), B.id)).toEqual({ defaultPremiseId: B.id });
  });

  it("does not touch the current selection — default and selected are separate pointers", () => {
    const patch = premisesAfterSetDefault(profile({ selectedPremiseId: A.id }), B.id);
    expect(patch).not.toHaveProperty("selectedPremiseId");
    expect(patch).not.toHaveProperty("premises");
  });

  it("rejects an unknown premise id rather than pointing the default at nothing", () => {
    expect(() => premisesAfterSetDefault(profile(), "p-gone")).toThrow();
  });

  it("is idempotent on the premise that is already default", () => {
    expect(premisesAfterSetDefault(profile(), A.id)).toEqual({ defaultPremiseId: A.id });
  });
});

describe("the default still behaves as the fallback it always was", () => {
  it("activePremise falls back to the NEW default once the selection is cleared", () => {
    const moved = { ...profile(), ...premisesAfterSetDefault(profile(), B.id) } as UserProfile;
    const noSelection = { ...moved, selectedPremiseId: undefined } as UserProfile;
    expect(activePremise(noSelection)).toEqual(B);
  });

  // Regression guard for the two paths that already wrote defaultPremiseId, so adding a third
  // writer does not quietly change them.
  it("saving a further premise still leaves the chosen default alone", () => {
    const moved = { ...profile(), ...premisesAfterSetDefault(profile(), B.id) } as UserProfile;
    const patch = premisesAfterSave(moved, { id: "p-c", name: "Third", address: "3 C St" });
    expect(patch).not.toHaveProperty("defaultPremiseId");
  });

  it("deleting the premise that is default repoints to a surviving one", () => {
    const moved = { ...profile(), ...premisesAfterSetDefault(profile(), B.id) } as UserProfile;
    expect(premisesAfterDelete(moved, B.id).defaultPremiseId).toBe(A.id);
  });
});
