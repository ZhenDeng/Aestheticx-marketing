import { describe, it, expect } from "vitest";
import { emptyState, addressForIdentity, setAddressForIdentity, profileForUser } from "@/lib/demo/backend";
import type { DemoState, Identity } from "@/lib/demo/types";

// Owner feedback #1/#2: address is per full identity (user + role + context); phone/AHPRA
// stay account-wide.
const nurseIndependent: Identity = {
  user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" },
};
const nurseClinic: Identity = {
  user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse",
  context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
};
const doctorIndependent: Identity = {
  user: { id: "u-sarah", name: "Sarah Chen" }, role: "doctor", context: { kind: "independent" },
};

describe("per-identity address (#2)", () => {
  it("falls back to the per-user default address when no override is set", () => {
    const state: DemoState = { ...emptyState(), profileByUser: { "u-sarah": { ahpra: "", abn: "", phone: "0400", address: "Default St", principalPlace: "", premises: [] } } };
    expect(addressForIdentity(state, nurseIndependent)).toBe("Default St");
    expect(addressForIdentity(state, nurseClinic)).toBe("Default St");
  });

  it("returns '' when neither an override nor a default exists", () => {
    expect(addressForIdentity(emptyState(), nurseIndependent)).toBe("");
  });

  it("stores a distinct address per identity and isolates the others", () => {
    let state = setAddressForIdentity(emptyState(), nurseIndependent, "14 Acland St");
    state = setAddressForIdentity(state, nurseClinic, "88 Chapel St");
    expect(addressForIdentity(state, nurseIndependent)).toBe("14 Acland St");
    expect(addressForIdentity(state, nurseClinic)).toBe("88 Chapel St");
    // A third identity for the same user is still on the default (untouched).
    expect(addressForIdentity(state, doctorIndependent)).toBe("");
  });

  it("does not touch the per-user profile (phone/AHPRA stay account-wide)", () => {
    const base: DemoState = { ...emptyState(), profileByUser: { "u-sarah": { ahpra: "NMW1", abn: "", phone: "0400", address: "Default St", principalPlace: "", premises: [] } } };
    const state = setAddressForIdentity(base, nurseClinic, "88 Chapel St");
    const profile = profileForUser(state, "u-sarah");
    expect(profile.phone).toBe("0400");
    expect(profile.ahpra).toBe("NMW1");
    expect(profile.address).toBe("Default St"); // per-user default unchanged
  });
});
