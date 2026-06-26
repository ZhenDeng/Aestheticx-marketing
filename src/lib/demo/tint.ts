import type { CSSProperties } from "react";
import type { Identity, Role } from "./types";

// Maps a role to the marketing site's role-tint palette (see RoleTintShowcase).
const ROLE_TINT: Record<Role, { tint: string; soft: string }> = {
  nurse: { tint: "var(--color-rose)", soft: "var(--color-rose-soft)" },
  clinicAdmin: { tint: "var(--color-slate)", soft: "var(--color-slate-soft)" },
  doctor: { tint: "var(--color-umber)", soft: "var(--color-umber-soft)" },
  superAdmin: { tint: "var(--color-sage)", soft: "var(--color-sage-soft)" },
};

export function tintStyle(identity: Identity): CSSProperties {
  // A clinic nurse reads as "sage" to distinguish from independent rose.
  const role = identity.role;
  const base = ROLE_TINT[role];
  if (role === "nurse" && identity.context.kind === "clinic") {
    return { "--color-tint": "var(--color-sage)", "--color-tint-soft": "var(--color-sage-soft)" } as CSSProperties;
  }
  return { "--color-tint": base.tint, "--color-tint-soft": base.soft } as CSSProperties;
}
