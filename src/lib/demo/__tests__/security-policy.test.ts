import { describe, it, expect } from "vitest";
import { checkPasswordPolicy, passwordPolicyIssues } from "@/lib/demo/securityPolicy";

// Port of AXDomain SecurityPolicy.swift PasswordPolicy (feedback-round-2 / auth-accounts):
// 8+ chars, an uppercase letter, a number, and a symbol from the iOS symbol set.
describe("checkPasswordPolicy", () => {
  it("fails every rule for the empty string", () => {
    expect(checkPasswordPolicy("")).toEqual({
      hasMinLength: false, hasUppercase: false, hasNumber: false, hasSymbol: false, satisfied: false,
    });
  });

  it("passes all rules for a compliant password", () => {
    expect(checkPasswordPolicy("Str0ng!pw")).toEqual({
      hasMinLength: true, hasUppercase: true, hasNumber: true, hasSymbol: true, satisfied: true,
    });
  });

  it("requires at least 8 characters", () => {
    expect(checkPasswordPolicy("A1!x").hasMinLength).toBe(false);
    expect(checkPasswordPolicy("A1!xxxxx").hasMinLength).toBe(true);
  });

  it("requires an uppercase letter", () => {
    expect(checkPasswordPolicy("str0ng!pw").hasUppercase).toBe(false);
    expect(checkPasswordPolicy("str0ng!pW").hasUppercase).toBe(true);
  });

  it("requires a number", () => {
    expect(checkPasswordPolicy("Strong!pw").hasNumber).toBe(false);
  });

  it("requires a symbol from the iOS set — characters outside it don't count", () => {
    // "<" and '"' are NOT in the iOS symbol set "!@#$%^&*()_-+=[]{};:,.?/\\|~`".
    expect(checkPasswordPolicy("Str0ngpw<").hasSymbol).toBe(false);
    expect(checkPasswordPolicy('Str0ngpw"').hasSymbol).toBe(false);
    // Every character of the iOS set counts.
    for (const sym of "!@#$%^&*()_-+=[]{};:,.?/\\|~`") {
      expect(checkPasswordPolicy(`Str0ngpw${sym}`).hasSymbol).toBe(true);
    }
  });

  it("a space is not a symbol", () => {
    expect(checkPasswordPolicy("Str0ngpw ").hasSymbol).toBe(false);
  });
});

describe("passwordPolicyIssues", () => {
  it("lists every unmet rule label for the empty string", () => {
    expect(passwordPolicyIssues("")).toEqual(["8+ chars", "upper", "number", "symbol"]);
  });

  it("is empty when the policy is satisfied", () => {
    expect(passwordPolicyIssues("Str0ng!pw")).toEqual([]);
  });

  it("lists only the rules still unmet", () => {
    expect(passwordPolicyIssues("Strongpassword")).toEqual(["number", "symbol"]);
  });
});
