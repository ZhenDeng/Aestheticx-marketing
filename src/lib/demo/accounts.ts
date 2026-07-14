// Port of SessionState.demoAccounts + the Lumière clinic ref.
import type { ClinicRef, Identity, PatientOwner, UserRef } from "./types";

export const LUMIERE: ClinicRef = {
  id: "clinic-lumiere",
  name: "Lumière Clinic",
  // The clinic's fixed premise of administration (round 6) — prints on clinic-context
  // authorisation documents.
  address: "2 Notts Ave, Bondi Beach NSW 2026",
};

const sarah: UserRef = { id: "u-sarah", name: "Sarah Chen" };
const ruby: UserRef = { id: "u-ruby", name: "Ruby Walsh" };
const voss: UserRef = { id: "u-voss", name: "Dr Elena Voss" };
const ava: UserRef = { id: "u-ava", name: "Ava Lim" };
const priya: UserRef = { id: "u-admin", name: "Priya Nair" };

export interface DemoAccount {
  label: string;
  /** Identities the account can act as; the first is the default on sign-in. */
  identities: Identity[];
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: "Sarah Chen — Nurse",
    identities: [
      { user: sarah, role: "nurse", context: { kind: "independent" } },
      { user: sarah, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } },
    ],
  },
  {
    label: "Ruby Walsh — Nurse",
    identities: [{ user: ruby, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } }],
  },
  {
    label: "Dr Elena Voss — Doctor",
    identities: [{ user: voss, role: "doctor", context: { kind: "independent" } }],
  },
  {
    label: "Ava Lim — Clinic Admin",
    identities: [{ user: ava, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } }],
  },
  {
    // Platform admin — a non-clinical role with its own admin shell (constitution §16/Rule 7).
    // Lets the demo exercise the admin separation; user administration stays live-only.
    label: "Priya Nair — Platform Admin",
    identities: [{ user: priya, role: "superAdmin", context: { kind: "independent" } }],
  },
];

// The demo cast's doctors, as picker refs — the demo-mode source for the auth-request
// doctor dropdown (demo has no backend to call listDoctors against).
export function demoDoctorRefs(): { doctorId: string; doctorName: string }[] {
  const seen = new Set<string>();
  const out: { doctorId: string; doctorName: string }[] = [];
  for (const acc of DEMO_ACCOUNTS) {
    for (const idn of acc.identities) {
      if (idn.role === "doctor" && !seen.has(idn.user.id)) {
        seen.add(idn.user.id);
        out.push({ doctorId: idn.user.id, doctorName: idn.user.name });
      }
    }
  }
  return out;
}

// Display name for a patient owner — clinic or nurse name where known, else the raw id
// (port of SessionState.ownerLabel, which resolves through the same demo accounts even
// in live mode). Shared by the doctor's "Other patients" grouping so owners label
// identically everywhere.
export function ownerLabel(owner: PatientOwner): string {
  if (owner.kind === "clinic") return owner.id === LUMIERE.id ? LUMIERE.name : owner.id;
  const user = DEMO_ACCOUNTS.flatMap((a) => a.identities).find((i) => i.user.id === owner.id);
  return user?.user.name ?? owner.id;
}
