import { describe, expect, it } from "vitest";
import { safeNextPath, loginUrlFor, landingFor, redirectForRole } from "@/lib/demo/authRedirect";

describe("safeNextPath", () => {
  it("accepts in-app paths, with query strings intact", () => {
    expect(safeNextPath("/app/dashboard")).toBe("/app/dashboard");
    expect(safeNextPath("/app/patients/p-1/forms/f-2?x=1")).toBe("/app/patients/p-1/forms/f-2?x=1");
  });

  it("falls back to the dashboard for anything not in-app", () => {
    expect(safeNextPath(null)).toBe("/app/dashboard");
    expect(safeNextPath("")).toBe("/app/dashboard");
    expect(safeNextPath("/login")).toBe("/app/dashboard");
    expect(safeNextPath("app/patients")).toBe("/app/dashboard");
    expect(safeNextPath("/apple")).toBe("/app/dashboard");
  });

  it("rejects open-redirect shapes", () => {
    expect(safeNextPath("//evil.example/app")).toBe("/app/dashboard");
    expect(safeNextPath("https://evil.example/app")).toBe("/app/dashboard");
    expect(safeNextPath("/\\evil")).toBe("/app/dashboard");
  });
});

describe("loginUrlFor", () => {
  it("carries the in-app target through the next param", () => {
    expect(loginUrlFor("/app/patients/p-1", "")).toBe("/login?next=%2Fapp%2Fpatients%2Fp-1");
    expect(loginUrlFor("/app/calendar", "?view=week")).toBe("/login?next=%2Fapp%2Fcalendar%3Fview%3Dweek");
  });

  it("returns a plain login URL for non-app paths", () => {
    expect(loginUrlFor("/", "")).toBe("/login");
    expect(loginUrlFor("/login", "?next=%2Fapp")).toBe("/login");
  });
});

describe("landingFor", () => {
  it("sends Platform Admin to the admin shell and everyone else to the dashboard", () => {
    expect(landingFor("superAdmin")).toBe("/app/admin");
    expect(landingFor("doctor")).toBe("/app/dashboard");
    expect(landingFor("nurse")).toBe("/app/dashboard");
    expect(landingFor("clinicAdmin")).toBe("/app/dashboard");
  });
});

describe("redirectForRole", () => {
  it("keeps Platform Admin out of clinical surfaces (→ admin home)", () => {
    expect(redirectForRole("superAdmin", "/app/dashboard")).toBe("/app/admin");
    expect(redirectForRole("superAdmin", "/app/calendar")).toBe("/app/admin");
    expect(redirectForRole("superAdmin", "/app/patients")).toBe("/app/admin"); // clinical list
    expect(redirectForRole("superAdmin", "/app/billing")).toBe("/app/admin");
    // The clinical sibling routes are NOT patient files — they must redirect too.
    expect(redirectForRole("superAdmin", "/app/patients/new")).toBe("/app/admin");
    expect(redirectForRole("superAdmin", "/app/patients/other")).toBe("/app/admin");
  });

  it("lets Platform Admin use the admin area, profile, and an individual patient file (audit access)", () => {
    expect(redirectForRole("superAdmin", "/app/admin")).toBeNull();
    expect(redirectForRole("superAdmin", "/app/admin/patients")).toBeNull();
    expect(redirectForRole("superAdmin", "/app/admin/audit")).toBeNull();
    expect(redirectForRole("superAdmin", "/app/profile")).toBeNull();
    expect(redirectForRole("superAdmin", "/app/patients/p-1")).toBeNull();
    expect(redirectForRole("superAdmin", "/app/patients/p-1/forms/f-2")).toBeNull();
  });

  it("bounces clinical roles out of the admin area, but leaves clinical routes alone", () => {
    expect(redirectForRole("doctor", "/app/admin")).toBe("/app/dashboard");
    expect(redirectForRole("doctor", "/app/admin/audit")).toBe("/app/dashboard");
    expect(redirectForRole("nurse", "/app/admin")).toBe("/app/dashboard");
    expect(redirectForRole("doctor", "/app/calendar")).toBeNull();
    expect(redirectForRole("clinicAdmin", "/app/patients")).toBeNull();
  });
});
