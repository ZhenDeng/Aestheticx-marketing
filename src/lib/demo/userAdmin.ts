// Client port of the backend's user-administration validation
// (backend/functions/src/userAdmin.ts) so the super-admin create-user form
// pre-validates exactly like the deployed createUser Function.

export interface NewPremiseInput {
  name: string;
  address: string;
}

export interface NewUserInput {
  email: string;
  name: string;
  abn: string;
  businessName: string;
  phone: string;
  temporaryPassword: string;
  roles: string[];
  ahpra?: string;
  /** 'clinic' provisions a clinic entity (auth-pdf-feedback-round-6); absent otherwise. */
  accountType?: string;
  /** Clinic accounts: the clinic's street address (its fixed premise of administration). */
  clinicAddress?: string;
  /** Doctors: address of the principal place of practice (Clause 68C direction body). */
  principalPlace?: string;
  /** Nurses: at least one premise of administration; the first becomes the default. */
  premises?: NewPremiseInput[];
  /** Optional contact address persisted to the user profile (16/07 feedback bug 2):
   *  the createUser Function writes it onto users/{uid}.address so it shows in Profile. */
  address?: string;
  /** Optional supervising doctor for a nurse (16/07 feedback bug 1): the createUser
   *  Function creates the cooperation relationship atomically so the nurse can raise
   *  requests immediately. Ignored for non-nurse accounts. */
  supervisingDoctorId?: string;
}

const PRESCRIBER_ROLES = ["doctor", "nurse"];

const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";

/** Returns the names of required fields that are missing/invalid; empty = valid. */
export function validateNewUser(input: NewUserInput): string[] {
  const missing: string[] = [];
  const roles = input.roles ?? [];
  // A Clinic account (auth-pdf-feedback-round-6): `name` IS the clinic name (there is no
  // separate person behind the login), so no AHPRA is required — it is an organisation,
  // not a registered health practitioner.
  const isClinicAccount = input.accountType === "clinic";
  if (blank(input.email)) missing.push("email");
  if (blank(input.name)) missing.push("name");
  if (blank(input.abn)) missing.push("abn");
  if (blank(input.businessName)) missing.push("businessName");
  if (blank(input.phone)) missing.push("phone");
  if (!Array.isArray(input.roles) || input.roles.length === 0) missing.push("roles");
  if (typeof input.temporaryPassword !== "string" || input.temporaryPassword.length < 8) {
    missing.push("temporaryPassword");
  }
  // AHPRA is mandatory for doctors and nurses (registered health practitioners) —
  // but never for clinic accounts (see above).
  if (!isClinicAccount && roles.some((r) => PRESCRIBER_ROLES.includes(r)) && blank(input.ahpra)) {
    missing.push("ahpra");
  }
  // Doctors must record their principal place of practice: it prints in the Clause 68C
  // direction body and the PDF signature block.
  if (!isClinicAccount && roles.includes("doctor") && blank(input.principalPlace)) {
    missing.push("principalPlace");
  }
  // Nurses must start with at least one premise of administration (their default), and
  // every supplied premise must be complete — a junk row is rejected, never persisted.
  if (!isClinicAccount && roles.includes("nurse")) {
    const premises = input.premises;
    const complete = (p: NewPremiseInput) => !blank(p?.name) && !blank(p?.address);
    if (!Array.isArray(premises) || premises.length === 0 || !premises.every(complete)) {
      missing.push("premises");
    }
  }
  if (isClinicAccount) {
    if (blank(input.clinicAddress)) missing.push("clinicAddress");
    if (!roles.includes("clinicAdmin")) missing.push("roles (clinic accounts must carry clinicAdmin)");
    // A clinic is an organisation login — clinical roles would bypass the practitioner
    // requirements above (AHPRA, principalPlace, premises) while gaining clinical write
    // capability.
    if (roles.some((r) => PRESCRIBER_ROLES.includes(r))) {
      missing.push("roles (clinic accounts cannot carry doctor/nurse roles)");
    }
  }
  return missing;
}
