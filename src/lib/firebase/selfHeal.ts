// Sign-in claims self-heal (17/07 feedback — replaces the admin-console "Repair access"
// button). The 16/07 first-login bug could wipe an account's role claims while its
// users/{uid} doc — server truth — still recorded them. The root cause is fixed server-
// side, but any account wiped before that fix would stay locked out until an admin
// intervened. Instead, identity resolution detects the wiped signature and asks the
// server to re-derive its own claims (syncUserClaims self arm), then refreshes the
// token. Pure logic lives here with injected effects so it is testable without the
// Firebase SDK; auth.ts wires the real SDK in.
import type { DemoClaims } from "./identity";

function validRoles(roles: unknown): string[] {
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : [];
}

function validClinics(clinics: unknown): Record<string, string> {
  return clinics && typeof clinics === "object" && !Array.isArray(clinics)
    ? (clinics as Record<string, string>)
    : {};
}

/** The wiped-claims signature: the ID token grants no roles while the users doc records
 *  at least one. A doc that grants nothing (or is malformed/absent) never triggers a
 *  repair — there is nothing a repair could restore. */
export function needsClaimsSelfHeal(tokenRoles: string[], userDoc: { roles?: unknown } | null): boolean {
  return tokenRoles.length === 0 && validRoles(userDoc?.roles).length > 0;
}

export interface SelfHealDeps {
  /** Read the current ID token's custom claims; forceRefresh mints a fresh token. */
  readTokenClaims: (forceRefresh: boolean) => Promise<Record<string, unknown>>;
  /** Read the caller's users/{uid} doc (null when absent/unreadable). */
  readUserDoc: () => Promise<({ name?: string; roles?: unknown } & Record<string, unknown>) | null>;
  /** Ask the server to re-derive the caller's own claims (syncUserClaims self arm). */
  repairOwnClaims: () => Promise<void>;
}

/** Resolve token claims + users doc, self-healing wiped claims once along the way.
 *  Single attempt, best-effort: any repair/refresh failure falls through to the
 *  original claims so sign-in is never worse than without the heal. */
export async function resolveClaimsWithSelfHeal(
  uid: string,
  deps: SelfHealDeps,
): Promise<{ claims: DemoClaims; userDoc: ({ name?: string } & Record<string, unknown>) | null }> {
  const parse = (raw: Record<string, unknown>): DemoClaims => ({
    uid,
    roles: validRoles(raw.roles),
    clinics: validClinics(raw.clinics),
  });
  let claims = parse(await deps.readTokenClaims(false));
  const userDoc = await deps.readUserDoc();
  if (needsClaimsSelfHeal(claims.roles, userDoc)) {
    try {
      await deps.repairOwnClaims();
      claims = parse(await deps.readTokenClaims(true));
    } catch {
      // Best-effort: the account stays as it was and the existing categorised
      // permission banner covers the failure — never block sign-in on the heal.
    }
  }
  return { claims, userDoc };
}
