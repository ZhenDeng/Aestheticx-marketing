// Pure mapping from Firebase custom claims (+ users/{uid} doc) to the app's Identity list.
// Claims shape ported from iOS AuthClaims: roles: string[], clinics: { [clinicId]: kind }.
import type { Identity, Role } from "@/lib/demo/types";

export interface DemoClaims {
  uid: string;
  roles: string[];
  clinics: Record<string, string>; // clinicId -> "admin" | "employee" | "contractor"
}

function isRole(r: string): r is Role {
  return r === "doctor" || r === "nurse" || r === "clinicAdmin" || r === "superAdmin";
}

export function identitiesFromClaims(claims: DemoClaims, userDoc: { name?: string } | null): Identity[] {
  const user = { id: claims.uid, name: userDoc?.name ?? "" };
  const identities: Identity[] = [];

  // Independent identities from top-level roles (nurse/doctor act independently).
  for (const r of claims.roles) {
    if (isRole(r) && (r === "nurse" || r === "doctor" || r === "superAdmin")) {
      identities.push({ user, role: r, context: { kind: "independent" } });
    }
  }

  // One identity per clinic membership; "admin" => clinicAdmin, else the user's clinical role.
  for (const [clinicId, kind] of Object.entries(claims.clinics)) {
    const clinic = { id: clinicId, name: clinicId };
    if (kind === "admin") {
      identities.push({ user, role: "clinicAdmin", context: { kind: "clinic", clinic } });
    } else {
      const clinicalRole: Role = claims.roles.includes("doctor") ? "doctor" : "nurse";
      identities.push({ user, role: clinicalRole, context: { kind: "clinic", clinic } });
    }
  }

  return identities;
}
