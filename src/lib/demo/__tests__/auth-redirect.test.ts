import { describe, expect, it } from "vitest";
import { safeNextPath, loginUrlFor } from "@/lib/demo/authRedirect";

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
