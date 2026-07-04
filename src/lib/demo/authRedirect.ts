// Pure helpers for preserving the requested /app URL across the login round-trip.
// No Firebase/React imports (unit-tested).

const FALLBACK = "/app/dashboard";

// True only for same-origin in-app paths: "/app..." with a single leading slash.
// "//host", "http(s)://", and backslash tricks all fail the prefix test, so a
// crafted ?next= can never redirect off-site (open-redirect guard).
function isInAppPath(path: string): boolean {
  return (path === "/app" || path.startsWith("/app/")) && !path.startsWith("//") && !path.includes("\\");
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
