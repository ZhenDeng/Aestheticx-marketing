// Sign-in claims self-heal (17/07 feedback — replaces the admin-console "Repair access"
// button). Identity resolution compares the token with users/{uid}, the server truth:
// it repairs both the historical wiped-role signature and clinic-membership changes
// made by relationship administration while the clinician still holds an older token.
// The existing syncUserClaims self arm re-derives the full claim set, then the client
// force-refreshes. Pure logic lives here with injected effects so it is testable without
// the Firebase SDK; auth.ts wires the real SDK in.
import type { DemoClaims } from "./identity";

function validRoles(roles: unknown): string[] {
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : [];
}

function validClinics(clinics: unknown): Record<string, string> {
  if (!clinics || typeof clinics !== "object" || Array.isArray(clinics)) return {};
  return Object.fromEntries(
    Object.entries(clinics).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function clinicClaimsDiffer(tokenClinics: Record<string, string>, userDoc: { clinics?: unknown } | null): boolean {
  // An unreadable/legacy users doc gives us no membership authority to compare against.
  // Only an explicit `clinics` field (including `{}` for revocation) can prove staleness.
  if (!userDoc || !Object.prototype.hasOwnProperty.call(userDoc, "clinics")) return false;
  const serverClinics = validClinics(userDoc?.clinics);
  const tokenEntries = Object.entries(tokenClinics).sort(([a], [b]) => a.localeCompare(b));
  const serverEntries = Object.entries(serverClinics).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(tokenEntries) !== JSON.stringify(serverEntries);
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
  readUserDoc: () => Promise<({ name?: string; roles?: unknown; clinics?: unknown } & Record<string, unknown>) | null>;
  /** Ask the server to re-derive the caller's own claims (syncUserClaims self arm). */
  repairOwnClaims: () => Promise<void>;
}

/** Resolve token claims + users doc, self-healing stale role/clinic claims once along the way.
 *  Single attempt, best-effort: any repair/refresh failure falls through to the
 *  original claims so sign-in is never worse than without the heal. The optional
 *  `healGuard` records an in-flight/cooldown deadline. A refreshed token can re-fire the
 *  watcher before claims propagate, while a later membership change or transient failure
 *  can still retry within the same page session. */
const SUCCESS_COOLDOWN_MS = 5_000;

export async function resolveClaimsWithSelfHeal(
  uid: string,
  deps: SelfHealDeps,
  healGuard?: Map<string, number>,
): Promise<{ claims: DemoClaims; userDoc: ({ name?: string } & Record<string, unknown>) | null }> {
  const parse = (raw: Record<string, unknown>): DemoClaims => ({
    uid,
    roles: validRoles(raw.roles),
    clinics: validClinics(raw.clinics),
  });
  let claims = parse(await deps.readTokenClaims(false));
  const userDoc = await deps.readUserDoc();
  // Relationship administration changes clinic membership server-side while a target
  // clinician may still hold an older ID token. Compare both grants (roles + clinics)
  // against users/{uid}, then use the existing server-truth repair path and force refresh.
  const stale = needsClaimsSelfHeal(claims.roles, userDoc) || clinicClaimsDiffer(claims.clinics, userDoc);
  const blockedUntil = healGuard?.get(uid) ?? 0;
  if (stale && blockedUntil <= Date.now()) {
    healGuard?.set(uid, Number.POSITIVE_INFINITY);
    let repaired = false;
    try {
      await deps.repairOwnClaims();
      claims = parse(await deps.readTokenClaims(true));
      repaired = true;
    } catch (error) {
      // Best-effort: the account stays as it was and the existing categorised
      // permission banner covers the failure — never block sign-in on the heal.
      // Logged so a fleet-wide heal failure (e.g. backend not yet deployed) is
      // visible in the console/monitoring rather than fully silent.
      console.error("Claims self-heal failed — account left as-is:", error);
    } finally {
      if (repaired) healGuard?.set(uid, Date.now() + SUCCESS_COOLDOWN_MS);
      else healGuard?.delete(uid);
    }
  }
  return { claims, userDoc };
}
