import { describe, expect, it } from "vitest";
import { navItemsFor, activeNavHref } from "@/lib/demo/nav";
import type { Role } from "@/lib/demo/types";

const labels = (role: Role) => navItemsFor(role).map((i) => i.label);

describe("navItemsFor", () => {
  it("gives Platform Admin the admin modules, not the clinical daily tabs", () => {
    const admin = labels("superAdmin");
    expect(admin).toEqual(["Admin", "Patient lookup", "Audit", "Profile"]);
    expect(admin).not.toContain("Calendar");
    expect(admin).not.toContain("Patients");
    expect(admin).not.toContain("Authorisations");
  });

  it("gives every clinical role the full clinical nav (unchanged)", () => {
    for (const role of ["doctor", "nurse", "clinicAdmin"] as const) {
      const nav = labels(role);
      expect(nav).toContain("Calendar");
      expect(nav).toContain("Patients");
      expect(nav).not.toContain("Admin");
    }
  });

  it("keeps Profile reachable for both admin and clinical roles", () => {
    expect(labels("superAdmin")).toContain("Profile");
    expect(labels("doctor")).toContain("Profile");
  });
});

describe("activeNavHref", () => {
  const admin = navItemsFor("superAdmin");
  const clinical = navItemsFor("doctor");

  it("uses the longest matching prefix so a parent tab doesn't stay lit on a child route", () => {
    expect(activeNavHref(admin, "/app/admin/audit")).toBe("/app/admin/audit");
    expect(activeNavHref(admin, "/app/admin/patients")).toBe("/app/admin/patients");
    expect(activeNavHref(admin, "/app/admin")).toBe("/app/admin");
  });

  it("matches a clinical tab on its nested pages", () => {
    expect(activeNavHref(clinical, "/app/patients/p-1")).toBe("/app/patients");
    expect(activeNavHref(clinical, "/app/calendar")).toBe("/app/calendar");
  });

  it("returns null when nothing matches", () => {
    expect(activeNavHref(admin, "/app/nowhere")).toBeNull();
  });
});
