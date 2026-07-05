// Device-local memory of which identity a multi-role user last practised as, so a reload
// keeps their choice instead of snapping back to the default (first) role. Purely a UI
// preference — the server re-derives real permissions from claims every request, so this
// never grants access. Storage is injected (unit-testable) and every access is wrapped
// (private browsing can throw). Mirrors loginPrefs.ts.
import type { Identity } from "./types";

export const SELECTED_IDENTITY_KEY = "ax.selectedIdentity";

// Stable key for one identity: role + context (clinic id or "independent"). Same shape as
// the profile switcher's list keys, so a remembered key matches a resolved identity exactly.
export function identityKey(identity: Identity): string {
  const ctx = identity.context.kind === "clinic" ? identity.context.clinic.id : "independent";
  return `${identity.role}:${ctx}`;
}

export function saveSelectedIdentity(storage: Storage, identity: Identity): void {
  try {
    storage.setItem(SELECTED_IDENTITY_KEY, JSON.stringify({ uid: identity.user.id, key: identityKey(identity) }));
  } catch {
    // Storage unavailable — remembering the identity is best-effort.
  }
}

// The stored key iff it belongs to this uid (so account B never inherits account A's pick).
export function rememberedIdentityKey(storage: Storage, uid: string): string | null {
  try {
    const raw = storage.getItem(SELECTED_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: unknown; key?: unknown };
    return parsed && parsed.uid === uid && typeof parsed.key === "string" ? parsed.key : null;
  } catch {
    return null;
  }
}

// The identity to start on: the remembered one if it's still in the resolved list, else the
// first (default), else null for an empty list.
export function pickInitialIdentity(storage: Storage, uid: string, identities: Identity[]): Identity | null {
  if (identities.length === 0) return null;
  const key = rememberedIdentityKey(storage, uid);
  return identities.find((i) => identityKey(i) === key) ?? identities[0];
}
