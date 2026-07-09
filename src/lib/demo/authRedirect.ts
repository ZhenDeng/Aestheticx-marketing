// Pure helpers for preserving the requested /app URL across the login round-trip, plus the
// role-aware landing + admin/clinical route separation (constitution §16/Rule 7).
// No Firebase/React imports (unit-tested).
import type { Role } from "./types";

const FALLBACK = "/app/dashboard";
const ADMIN_HOME = "/app/admin";

// True only for same-origin in-app paths. The "/app" prefix requirement alone is the
// open-redirect guard: "//host", "http(s)://", and control-char tricks all fail it
// (allow-list, not block-list). Backslashes are rejected because some browsers treat
// "\" as "/" when resolving URLs.
function isInAppPath(path: string): boolean {
  return (path === "/app" || path.startsWith("/app/")) && !path.includes("\\");
}

/** The post-login destination: the requested in-app path, or the dashboard. */
export function safeNextPath(raw: string | null): string {
  if (!raw) return FALLBACK;
  return isInAppPath(raw) ? raw : FALLBACK;
}

/** Login URL that carries an in-app target (path + query) through ?next=. */
export function loginUrlFor(pathname: string, search: string): string {
  if (!isInAppPath(pathname)) return "/login";
  return `/login?next=${encodeURIComponent(pathname + search)}`;
}

/**
 * The home an identity lands on after login / identity switch. Platform Admin gets the admin
 * shell, not the clinical dashboard (constitution §16/Rule 7).
 */
export function landingFor(role: Role): string {
  return role === "superAdmin" ? ADMIN_HOME : FALLBACK;
}

// A specific patient file (or its subpages) — the admin's audit-access target, allowed even
// though the clinical /app/patients list is not. Only a real id segment counts: the list
// (`/app/patients`) and the clinical sibling routes `/app/patients/new` (create form) and
// `/app/patients/other` (doctor's grouped list) are NOT patient files and stay redirected.
function isPatientFilePath(path: string): boolean {
  const m = /^\/app\/patients\/([^/]+)(\/.*)?$/.exec(path);
  return m !== null && m[1] !== "new" && m[1] !== "other";
}

/**
 * Role-based route guard for the authenticated /app area. Returns the path to redirect to, or
 * null if the current path is allowed for the role.
 *
 * - Platform Admin may use the admin area (`/app/admin*`), their profile, and an individual
 *   patient file (audit access) — every other clinical surface (dashboard, calendar, the
 *   clinical patient list, invoices, …) redirects to the admin home (§16/Rule 7).
 * - Non-admins may not enter the admin area — it bounces to the clinical dashboard.
 */
export function redirectForRole(role: Role, pathname: string): string | null {
  if (role === "superAdmin") {
    const allowed =
      pathname === ADMIN_HOME ||
      pathname.startsWith(ADMIN_HOME + "/") ||
      pathname === "/app/profile" ||
      pathname.startsWith("/app/profile/") ||
      isPatientFilePath(pathname);
    return allowed ? null : ADMIN_HOME;
  }
  // Clinical roles: keep them out of the admin console.
  if (pathname === ADMIN_HOME || pathname.startsWith(ADMIN_HOME + "/")) return FALLBACK;
  return null;
}
