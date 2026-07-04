// Port of AXDomain SecurityPolicy.swift PasswordPolicy (feedback-round-2 / auth-accounts).
// Pure, testable first-login password rules: the change-password screen shows each as a
// chip and only enables submit when `satisfied`.

export interface PasswordPolicyResult {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  satisfied: boolean;
}

// The exact iOS symbol set — characters outside it (e.g. "<", quotes, space) don't count.
const SYMBOLS = new Set("!@#$%^&*()_-+=[]{};:,.?/\\|~`");

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const hasMinLength = [...password].length >= 8;
  const hasUppercase = /\p{Lu}/u.test(password);
  const hasNumber = /\p{Nd}/u.test(password);
  const hasSymbol = [...password].some((ch) => SYMBOLS.has(ch));
  return { hasMinLength, hasUppercase, hasNumber, hasSymbol, satisfied: hasMinLength && hasUppercase && hasNumber && hasSymbol };
}

// Unmet rules as the iOS chip labels, in chip order. Empty means the policy passes.
export function passwordPolicyIssues(password: string): string[] {
  const r = checkPasswordPolicy(password);
  const issues: string[] = [];
  if (!r.hasMinLength) issues.push("8+ chars");
  if (!r.hasUppercase) issues.push("upper");
  if (!r.hasNumber) issues.push("number");
  if (!r.hasSymbol) issues.push("symbol");
  return issues;
}
