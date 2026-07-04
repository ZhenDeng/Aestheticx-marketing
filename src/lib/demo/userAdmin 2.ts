// Client port of the backend's user-administration validation
// (backend/functions/src/userAdmin.ts) so the super-admin create-user form
// pre-validates exactly like the deployed createUser Function.

export interface NewUserInput {
  email: string;
  name: string;
  abn: string;
  businessName: string;
  phone: string;
  temporaryPassword: string;
  roles: string[];
  ahpra?: string;
}

const PRESCRIBER_ROLES = ["doctor", "nurse"];

/** Returns the names of required fields that are missing/invalid; empty = valid. */
export function validateNewUser(input: NewUserInput): string[] {
  const missing: string[] = [];
  const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";
  if (blank(input.email)) missing.push("email");
  if (blank(input.name)) missing.push("name");
  if (blank(input.abn)) missing.push("abn");
  if (blank(input.businessName)) missing.push("businessName");
  if (blank(input.phone)) missing.push("phone");
  if (!Array.isArray(input.roles) || input.roles.length === 0) missing.push("roles");
  if (typeof input.temporaryPassword !== "string" || input.temporaryPassword.length < 8) {
    missing.push("temporaryPassword");
  }
  // AHPRA is mandatory for doctors and nurses (registered health practitioners).
  if ((input.roles ?? []).some((r) => PRESCRIBER_ROLES.includes(r)) && blank(input.ahpra)) {
    missing.push("ahpra");
  }
  return missing;
}
