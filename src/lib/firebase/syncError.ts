// Sync-failure categorisation (16/07 feedback bug 1). Live writes that fail land in the
// store's mirror catches; previously every one surfaced ONE hardcoded "reconcile on
// refresh" banner, so a permission failure (e.g. a nurse whose custom claims were wiped
// at first login) looked identical to a transient network blip and couldn't be diagnosed.
// This splits the two: a permission failure gets actionable copy (and the store force-
// refreshes the ID token once, so a merely-stale-claims session self-heals), while
// everything else keeps the reconcile-on-refresh wording.

const PERMISSION_CODES = new Set([
  "permission-denied",
  "functions/permission-denied",
  "unauthenticated",
  "functions/unauthenticated",
]);

/** True when the failure is an authorisation denial (callable or Firestore rules), as
 *  opposed to a transient/connectivity error. Accepts a Firebase error (has `code`),
 *  a plain Error (message), or anything else (false). Plain friendly strings are never
 *  permission errors — they are our own listener messages. */
export function isPermissionError(e: unknown): boolean {
  if (typeof e === "string") return false;
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: unknown }).code);
    if (PERMISSION_CODES.has(code)) return true;
  }
  const message = e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  return /permission[-_ ]denied|insufficient permissions/i.test(message);
}

const RECONCILE_COPY = "A change could not be saved to the server. It will reconcile on refresh.";
const PERMISSION_COPY =
  "Permission denied: your account isn’t allowed to make that change. If you were set up recently, your access may still be provisioning — your administrator can repair it from the admin console.";

/** The banner message for a sync failure. An already-friendly string (a listener message
 *  the store passes verbatim) is returned unchanged; a permission failure gets actionable
 *  copy; anything else keeps the reconcile-on-refresh wording. */
export function syncErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  return isPermissionError(e) ? PERMISSION_COPY : RECONCILE_COPY;
}
