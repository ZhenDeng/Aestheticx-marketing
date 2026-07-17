# Proposal: feedback-1707-regression-fixes

## Why

17/07 owner feedback on the 16/07 fixes: the manual "Repair access" button on the admin accounts list was flagged as unwanted ("no band-aid patches — fix the root cause"), and the accounts list overflows the viewport horizontally on the Super Admin account. Investigation confirmed the underlying claims-wipe bug is fixed server-side and the affected nurse account is repaired, but recovery still depends on a Super Admin noticing lockout symptoms and clicking a button — the account should heal itself. The accounts list rows (avatar + name + up to three non-wrapping action buttons) push past the container at narrow widths.

## What Changes

- **Remove** the manual "Repair access" button from the admin console accounts list.
- Backend `syncUserClaims` callable gains a **self-repair arm**: any signed-in caller may repair **their own** claims (superAdmin retains repair-anyone). Derivation stays server-truth (`users/{uid}` doc) — a caller receives exactly what their profile grants, so no escalation is possible.
- Web sign-in identity resolution **self-heals automatically**: when the ID token carries empty `roles` but the caller's `users/{uid}` doc has roles (the wiped-claims signature), the client calls `syncUserClaims` for itself, force-refreshes the token, and re-reads identities — no admin involvement, no manual step.
- Admin console accounts list rows **wrap their action buttons** instead of overflowing the viewport; the list never causes horizontal page scroll.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `account-provisioning`: recovery from wiped role claims becomes automatic at sign-in (self-heal), replacing the manual admin repair path; the admin accounts list must remain within the horizontal viewport at any supported width.

## Impact

- **Backend (AestheticX repo, branch `fix/1707-claims-autoheal`):** `functions/src/index.ts` (`syncUserClaims` authorization), `functions/src/userAdmin.ts` (pure helper + tests). Redeploy of `syncUserClaims` required. Backwards compatible — superAdmin path unchanged.
- **Web (Aestheticx-marketing repo, branch `fix/1707-claims-autoheal-admin-layout`):** `src/lib/firebase/auth.ts` / `identity` resolution (self-heal hook), `src/lib/firebase/mirror.ts` (callable), `src/components/admin/AdminConsole.tsx` (button removal + row wrap), related tests.
- **Deploy order:** backend first (web self-heal calls the relaxed callable; until deployed, a wiped non-admin caller would get `permission-denied` — same as today, so no regression window).
