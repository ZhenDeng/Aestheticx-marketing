// Port of SessionState.demoAccounts + the Lumière clinic ref.
import type { ClinicRef, Identity, UserRef } from "./types";

export const LUMIERE: ClinicRef = { id: "clinic-lumiere", name: "Lumière Clinic" };

const sarah: UserRef = { id: "u-sarah", name: "Sarah Chen" };
const ruby: UserRef = { id: "u-ruby", name: "Ruby Walsh" };
const voss: UserRef = { id: "u-voss", name: "Dr Elena Voss" };
const ava: UserRef = { id: "u-ava", name: "Ava Lim" };

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
];
