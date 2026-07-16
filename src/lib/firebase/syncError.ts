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

// Failures a refresh will never fix — the request itself was rejected on its merits (a
// stale/duplicate delete, an already-invoiced script, a bad argument). Telling the user to
// "refresh" here is misleading, so they get distinct copy.
const PERMANENT_CODES = new Set([
  "not-found",
  "functions/not-found",
  "failed-precondition",
  "functions/failed-precondition",
  "invalid-argument",
  "functions/invalid-argument",
  "already-exists",
  "functions/already-exists",
]);

function codeOf(e: unknown): string {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
}

/** True when the failure is an authorisation denial (callable or Firestore rules), as
 *  opposed to a transient/connectivity error. Accepts a Firebase error (has `code`),
 *  a plain Error (message), or anything else (false). Plain friendly strings are never
 *  permission errors — they are our own listener messages. */
export function isPermissionError(e: unknown): boolean {
  if (typeof e === "string") return false;
  if (PERMISSION_CODES.has(codeOf(e))) return true;
  const message = e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  return /permission[-_ ]denied|insufficient permissions/i.test(message);
}

const RECONCILE_COPY = "A change could not be saved to the server. It will reconcile on refresh.";
const PERMANENT_COPY = "That change couldn’t be completed — it may have already been made, or no longer applies. Refreshing won’t change this; check the current state and try again if needed.";
const PERMISSION_COPY =
  "Permission denied: your account isn’t allowed to make that change. If you were set up recently, your access may still be provisioning — your administrator can repair it from the admin console.";

/** The banner message for a sync failure. An already-friendly string (a listener message
 *  the store passes verbatim) is returned unchanged; a permission failure gets actionable
 *  copy; a permanent failure (refresh won't fix it) says so; anything else keeps the
 *  reconcile-on-refresh wording for genuinely transient blips. */
export function syncErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (isPermissionError(e)) return PERMISSION_COPY;
  if (PERMANENT_CODES.has(codeOf(e))) return PERMANENT_COPY;
  return RECONCILE_COPY;
}
