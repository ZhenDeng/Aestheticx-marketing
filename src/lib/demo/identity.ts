// Pure helpers over an account's set of identities. An account can hold several identities
// (e.g. doctor + clinicAdmin); the auth context tracks one *active* identity plus the full set.
import { DEMO_ACCOUNTS } from "./accounts";
import type { CooperationRelationship, Identity } from "./types";

/**
 * The full set of identities the signed-in account holds, cross-mode. Live mode resolves them
 * from the ID-token claims (`availableIdentities`); demo mode leaves that empty, so we recover the
 * account's identities from DEMO_ACCOUNTS by matching the active identity's user id (falling back
 * to just the active identity). Mirrors the resolution the profile switcher uses.
 *
 * The demo-fallback assumes DEMO_ACCOUNTS user ids are unique across accounts (they are — see
 * accounts.ts); the live path is uid-safe regardless (claims are server-verified per user).
 */
export function heldIdentities(
  active: Identity,
  available: Identity[],
  demoRelationships: CooperationRelationship[] = [],
): Identity[] {
  if (available.length) return available;
  const base = DEMO_ACCOUNTS.find((a) => a.identities.some((i) => i.user.id === active.user.id))?.identities ?? [active];
  if (demoRelationships.length === 0) return base;
  const identities = [...base];

  // Live clinic identities come from server-verified membership claims. Demo mode has no
  // claims service, so mirror the same outcome from its in-memory relationship source:
  // an active doctor↔clinic relationship grants the doctor an employee clinic identity.
  for (const relationship of demoRelationships) {
    if (relationship.status !== "active" || relationship.counterpartyType !== "clinic") continue;
    if (relationship.doctorID !== active.user.id) continue;
    const duplicate = identities.some((identity) =>
      identity.role === "doctor"
      && identity.context.kind === "clinic"
      && identity.context.clinic.id === relationship.counterpartyID);
    if (duplicate) continue;
    identities.push({
      user: active.user,
      role: "doctor",
      context: {
        kind: "clinic",
        clinic: { id: relationship.counterpartyID, name: relationship.counterpartyName },
      },
    });
  }
  return identities;
}

/**
 * The account's doctor identity, if it holds one. Prescribing/approval is always-on across
 * workspaces (core-architecture constitution): the review inbox and approve/require-edit run
 * under this identity regardless of which workspace is currently selected — so a doctor+clinicAdmin
 * keeps their approval capability even while acting as the clinic admin. Returns null for accounts
 * that hold no doctor identity (a pure nurse/clinicAdmin/superAdmin).
 */
export function prescriberIdentity(identities: Identity[]): Identity | null {
  return identities.find((i) => i.role === "doctor") ?? null;
}
