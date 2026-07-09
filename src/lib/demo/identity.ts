// Pure helpers over an account's set of identities. An account can hold several identities
// (e.g. doctor + clinicAdmin); the auth context tracks one *active* identity plus the full set.
import { DEMO_ACCOUNTS } from "./accounts";
import type { Identity } from "./types";

/**
 * The full set of identities the signed-in account holds, cross-mode. Live mode resolves them
 * from the ID-token claims (`availableIdentities`); demo mode leaves that empty, so we recover the
 * account's identities from DEMO_ACCOUNTS by matching the active identity's user id (falling back
 * to just the active identity). Mirrors the resolution the profile switcher uses.
 */
export function heldIdentities(active: Identity, available: Identity[]): Identity[] {
  if (available.length) return available;
  return DEMO_ACCOUNTS.find((a) => a.identities.some((i) => i.user.id === active.user.id))?.identities ?? [active];
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
