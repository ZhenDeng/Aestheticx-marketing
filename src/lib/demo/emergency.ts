// Pure emergency-authorisation logic (spec 2026-07-08 emergency-authorisations). Imports only
// ./types — no dependency on backend.ts, so backend.ts can import this without a cycle.
import type { DemoState, EmergencyAuthorisation, EmergencyKind, MedicationItem } from "./types";

export const EMERGENCY_VALIDITY_MONTHS = 12;

// Hyaluronidase reverses HA fillers only — not biostimulators (collagenStimulator: Sculptra/
// Radiesse/Ellansé) or skin boosters. So the product category is the correct discriminator.
export function isReversibleFiller(item: MedicationItem): boolean {
  return item.category === "haFiller";
}

// Every approval yields an adrenaline emergency authorisation; an HA filler adds hyaluronidase.
// Deterministic order (adrenaline first) keeps display and tests stable.
export function emergencyKindsFor(items: MedicationItem[]): EmergencyKind[] {
  const kinds: EmergencyKind[] = ["adrenaline"];
  if (items.some(isReversibleFiller)) kinds.push("hyaluronidase");
  return kinds;
}

export interface ApplyEmergencyArgs {
  patientID: string;
  doctorID: string;
  doctorName: string;
  kinds: EmergencyKind[];
  sourceAuthIDs: string[];
  now: number;
  expiresAt: number;
}

function emergencyID(patientID: string, doctorID: string, kind: EmergencyKind): string {
  return `${patientID}_${doctorID}_${kind}`;
}

// Pure create-or-refresh. One record per (patient, doctor, kind): a repeat approval refreshes
// the same id (createdAt preserved, expiry bumped, sources unioned) rather than duplicating.
export function applyEmergencyAuthorisations(
  existing: Record<string, EmergencyAuthorisation>,
  args: ApplyEmergencyArgs,
): Record<string, EmergencyAuthorisation> {
  const next = { ...existing };
  for (const kind of args.kinds) {
    const id = emergencyID(args.patientID, args.doctorID, kind);
    const prior = next[id];
    const sourceAuthorisationIDs = Array.from(
      new Set([...(prior?.sourceAuthorisationIDs ?? []), ...args.sourceAuthIDs]),
    );
    next[id] = {
      id,
      patientID: args.patientID,
      doctorID: args.doctorID,
      doctorName: args.doctorName,
      kind,
      createdAt: prior?.createdAt ?? args.now,
      refreshedAt: args.now,
      expiresAt: args.expiresAt,
      sourceAuthorisationIDs,
    };
  }
  return next;
}

const KIND_ORDER: Record<EmergencyKind, number> = { adrenaline: 0, hyaluronidase: 1 };

// Active = not yet expired, for this patient. Adrenaline first, then by doctor name.
export function activeEmergencyAuthorisationsForPatient(
  state: DemoState,
  patientID: string,
  now: number,
): EmergencyAuthorisation[] {
  return Object.values(state.emergencyAuthorisationsByID)
    .filter((e) => e.patientID === patientID && e.expiresAt > now)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.doctorName.localeCompare(b.doctorName));
}
