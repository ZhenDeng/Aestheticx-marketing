// Clinic directory for the admin console's cooperation picker (spec: cooperation-linking):
// live hydrates the clinics collection for super admins; demo seeds Lumière. The list
// selector sorts by name and never yields a blank label — an unnamed clinic is surfaced
// with an explicit fallback, not silently omitted and never a bare id masquerading as a name.
import { describe, it, expect } from "vitest";
import { clinicDirectoryList, emptyState } from "@/lib/demo/backend";
import { buildSeedState } from "@/lib/demo/seed";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState } from "@/lib/demo/types";

function withClinics(clinics: DemoState["clinicsByID"]): DemoState {
  return { ...emptyState(), clinicsByID: clinics };
}

describe("clinicDirectoryList", () => {
  it("lists clinics sorted by name", () => {
    const state = withClinics({
      "c-z": { id: "c-z", name: "Zenith Aesthetics" },
      "c-a": { id: "c-a", name: "Aurora Skin" },
    });
    expect(clinicDirectoryList(state).map((c) => c.label)).toEqual(["Aurora Skin", "Zenith Aesthetics"]);
  });

  it("gives an unnamed clinic an explicit fallback label instead of dropping it or showing a raw id", () => {
    const state = withClinics({ "xY3kf9": { id: "xY3kf9", name: "  " } });
    const [entry] = clinicDirectoryList(state);
    expect(entry.id).toBe("xY3kf9");
    expect(entry.label.trim()).not.toBe("");
    expect(entry.label).not.toBe("xY3kf9");
  });

  it("is empty when no clinics are provisioned", () => {
    expect(clinicDirectoryList(emptyState())).toEqual([]);
  });
});

describe("demo seed clinic directory", () => {
  it("seeds the Lumière clinic so the demo picker mirrors live", () => {
    const state = buildSeedState();
    expect(state.clinicsByID[LUMIERE.id]).toEqual(LUMIERE);
  });
});
