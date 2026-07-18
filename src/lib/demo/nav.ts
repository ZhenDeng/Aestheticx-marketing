// Role-aware primary navigation (constitution §16/Rule 7: Platform Admin must not use the same
// clinical UI as normal users). Pure — unit-tested, no React/Firebase imports.
import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
}

// 14/07 feedback: Invoice is a first-class tab. Billing matrix (change:
// multi-tenant-billing-matrix): the tab opens to EVERY clinical role — nurses and clinic
// admins now issue/receive their own invoice streams (client sales, top-ups, service
// fees); the doctor-only restriction (15/07) applied only while authorisation invoicing
// was the sole stream.
const CLINICAL_NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/patients", label: "Patients" },
  { href: "/app/authorisations", label: "Authorisations" },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/availability", label: "Availability" },
  { href: "/app/billing", label: "Invoice" },
  { href: "/app/templates", label: "Templates" },
  { href: "/app/bookings", label: "Bookings" },
  { href: "/app/profile", label: "Profile" },
];

// Platform Admin's daily nav — management modules only, no Calendar/Notes/Bookings/Invoice or
// a clinical patient list (§16). Patient access is the audit-oriented "Patient lookup".
const ADMIN_NAV: NavItem[] = [
  { href: "/app/admin", label: "Admin" },
  { href: "/app/admin/patients", label: "Patient lookup" },
  { href: "/app/admin/audit", label: "Audit" },
  { href: "/app/profile", label: "Profile" },
];

export function navItemsFor(role: Role): NavItem[] {
  return role === "superAdmin" ? ADMIN_NAV : CLINICAL_NAV;
}

// The nav href that should render active for a pathname: the longest item href that is the
// pathname itself or a path prefix of it. Longest-match so "/app/admin" doesn't stay lit on
// "/app/admin/audit" (both are prefixes; the more specific one wins). Null if none match.
export function activeNavHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    if ((pathname === href || pathname.startsWith(href + "/")) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
