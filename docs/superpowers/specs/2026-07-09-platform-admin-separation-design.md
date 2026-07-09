# Platform-Admin separation (§16 / Rule 7 / §21 admin-access audit) — design

**Date:** 2026-07-09 · **Roadmap:** core-architecture audit, Tier-1 gap #4. Web-only, self-contained.

## Constitution (exact requirements)

- **§16 Platform Admin Philosophy** — Platform Admin "should not have the same interface as
  doctor, nurse, or clinic users" and "should not primarily see" Calendar, Notes, Bookings,
  Invoice workflow, Patient list. Its purpose is to *manage the platform* (doctors, nurses,
  clinics, employees, profiles, business entities, cooperation relationships, role assignments,
  product library, audit access). Admin *may* access patient data "for rare audit or support
  scenarios" but "this should not appear as a normal patient-list workflow" — it must be "placed
  in a less prominent admin area and **should be logged**."
- **Rule 7** — "Platform Admin must not use the same clinical UI as normal users… Patient access
  for Platform Admin should be audit-oriented and not part of normal daily navigation."
- **§21 Audit Philosophy** — audit records should exist for (among others) "Patient file access
  by Platform Admin."
- **§18 Main Module Philosophy** — "Admin" is one of the conceptual modules.

## Problem (current state, code-grounded 2026-07-09)

1. **Nav is role-blind.** `AppShell.tsx` renders a static `NAV` (Dashboard, Patients,
   Authorisations, Calendar, Availability, Templates, Bookings, Profile) for **every** role — a
   superAdmin sees the identical clinical shell (violates Rule 7 / §16).
2. **No admin landing.** `authRedirect.ts` FALLBACK is `/app/dashboard` for all roles; a
   superAdmin lands on the clinical dashboard with no role redirect.
3. **Admin console is buried in Profile.** `profile/page.tsx` renders `AdminConsole`
   (`{isSuperAdmin && …}`) — account inventory + create-user + cooperation relationships live
   inside a clinical settings page rather than a first-class Admin module.
4. **Patient access is prominent + unlogged.** `patientPermissions` (backend.ts) early-returns
   full view for superAdmin; the clinical Patients list/file are reachable from the main nav; **no
   audit event is written when an admin opens a patient file.**
5. **No superAdmin in the demo cast.** `DEMO_ACCOUNTS` has only nurse/nurse/doctor/clinicAdmin —
   the admin surface is currently reachable only in live mode, so the separation is untestable in
   demo and breaks demo/live parity.

## Scope

**In:** everything to satisfy §16 / Rule 7 in the web app, plus the §21 *admin-patient-access*
audit slice (the one §21 record that this separation directly produces).

**Out (documented, not papered over):**
- The broader §21 Audit Log (authorisation lifecycle, PDF generation, invoice-item generation,
  emergency-auth generation) — its own Tier-1 build; cross-repo (backend collection + write paths
  + rules).
- **Live durable persistence** of the admin-access audit to Firestore (collection + rule +
  hydrate). Deferred to the §21 build. This increment records admin access in the in-session store
  (works in demo and live for the session); it is *not* silently dropped, but in live it is not yet
  durable across refresh. The audit view states this in live mode.
- Product-library editing, first-class Business Entity/ABN objects, role-changes on existing users
  (all separate roadmap items). The admin home links/stubs them as "coming" where useful.

## Change

### Model + pure helpers

- **`accounts.ts`** — add a demo superAdmin: `Priya Nair — Platform Admin`
  (`{ user: {id:"u-admin", name:"Priya Nair"}, role:"superAdmin", context:{kind:"independent"} }`).
  `demoDoctorRefs()` is unaffected (filters `role==="doctor"`). `seed.ts` seeds `accountsByID` from
  `DEMO_ACCOUNTS`, so the admin appears in the (read-only, demo) account inventory too.
- **`types.ts`** — `AdminAccessAuditEntry { id, actorID, actorName, patientID, patientName, at }`
  and `DemoState.adminAccessAuditByID: Record<string, AdminAccessAuditEntry>` (+ `emptyState`).
- **`nav.ts` (new pure module)** — `NavItem { href, label }` and
  `navItemsFor(role: Role): NavItem[]`:
  - clinical (`doctor`/`nurse`/`clinicAdmin`): the existing 8-item clinical NAV (unchanged).
  - `superAdmin`: `[Admin →/app/admin, Patient lookup →/app/admin/patients,
    Audit →/app/admin/audit, Profile →/app/profile]` — no Calendar/Notes/Bookings/Invoice/Patient
    list in daily nav (§16).
- **`authRedirect.ts`** — `landingFor(role: Role): string` → superAdmin `"/app/admin"`, else
  `"/app/dashboard"`. Add `redirectForRole(role, pathname): string | null` — the route guard:
  - superAdmin on a clinical route (any `/app/*` not under `/app/admin` or `/app/profile`) →
    `"/app/admin"`.
  - non-superAdmin on `/app/admin*` → `"/app/dashboard"`.
  - otherwise `null` (allowed). Pure + unit-tested (allow-list, same spirit as `isInAppPath`).
- **`backend.ts`** —
  - `recordAdminPatientAccess(state, { actor: Identity, patient }): DemoState` — appends an
    `AdminAccessAuditEntry` **only when `actor.role === "superAdmin"`** (otherwise returns state
    unchanged; non-admins never audit-log). Idempotence is not required (each open is an access
    event); id via `makeID("adminaccess")`.
  - `adminAccessAuditEntries(state): AdminAccessAuditEntry[]` — sorted by `at` desc.
  - `patientPermissions` is unchanged (admin retains read access); separation is achieved by
    navigation + a logged entry point, not by revoking the permission.

### Store (`store.tsx`)

- `adminAccessAudit(): AdminAccessAuditEntry[]` selector.
- `recordAdminAccess(patient): void` — appends via `backend.recordAdminPatientAccess` using the
  active identity. **Demo and live both** `setState` (in-session record); **no mirror callable this
  increment** (durable live persistence deferred to §21 — marked with a `TODO(§21)` at the seam so
  it is a documented extension point, not a silent gap).

### Routing / shell / guards

- **`AppShell.tsx`** — replace the static `NAV.map` with `navItemsFor(identity.role)`. No other
  shell change; tint/badge unchanged.
- **`AuthGuard.tsx`** — after the existing auth/`mustChangePassword` checks, apply
  `redirectForRole(identity.role, pathname)` and `router.replace` when non-null. Keeps
  unauthenticated → `/login` behaviour.
- **`LoginForm.tsx` / live redirect / `profile` identity-switch** — post-auth and post-switch
  destination uses `landingFor(role)` instead of the hardcoded `/app/dashboard`
  (`safeNextPath` still honours an explicit `?next=`).

### Admin module (`/app/admin`)

Extract the console components currently inside `profile/page.tsx` into
`src/components/admin/AdminConsole.tsx` (Account inventory + create-user + Cooperation
relationships — behaviour unchanged, incl. the demo/live split and the relationship-audit
"history"). Then:

- **`/app/admin/page.tsx`** — admin home. Header "Platform administration". Renders the moved
  `AdminConsole` (Users + Relationships management sections) + a distinct, low-prominence
  "Patient records — audit access" card linking to `/app/admin/patients` with the notice
  "Opening a patient file here is recorded in the audit log." Small stub row for
  Product library / Business entities marked "Managed elsewhere / coming".
- **`/app/admin/patients/page.tsx`** — audit-oriented **Patient lookup**: search box + results
  (reuses `store.searchPatients(query, identity)`); each row links to the patient file; a banner
  frames this as audit/support access that is recorded. (No "New patient" — already false for
  superAdmin.)
- **`/app/admin/audit/page.tsx`** — **Audit log** view: the admin-patient-access entries
  (`store.adminAccessAudit()`), newest first (actor, patient, timestamp). In **live** mode a note:
  "Records are kept for this session; durable audit storage rolls out with the platform audit log."
- **`profile/page.tsx`** — remove `{isSuperAdmin && <AdminConsole/>}`; the superAdmin still edits
  their own profile and switches identity here. (Profile stays in admin nav.)
- **Patient-file access logging** — in the patient-file page (`/app/patients/[id]`), when
  `identity.role === "superAdmin"`, call `store.recordAdminAccess(patient)` once on view, and show
  an "Audit access — this view is recorded" banner. Logging at the file itself (not just the lookup
  entry point) also covers deep-links, satisfying "should be logged" robustly.

## Non-goals / conflicts checked (Rule/§ cross-check)

- **Rule 3 (prescribing always-on):** unaffected — superAdmin is a separate identity/workspace;
  a doctor who is *also* superAdmin keeps their doctor identity with the full clinical nav; only
  the superAdmin *workspace* gets the admin shell. Per-identity nav, not per-user.
- **Patient-file isolation / ownership:** unchanged (`patientPermissions` untouched).
- No backend, no Firestore rules, no deploy this increment (web-only) → no production-PHI action.

## Testing (TDD — write first)

Pure/unit (vitest):
- `navItemsFor` — superAdmin returns the admin set (no clinical daily tabs); each clinical role
  returns the full clinical set; Profile present in both.
- `landingFor` — superAdmin → `/app/admin`; doctor/nurse/clinicAdmin → `/app/dashboard`.
- `redirectForRole` — superAdmin on `/app/calendar` → `/app/admin`; superAdmin on `/app/admin/x`
  and `/app/profile` → `null`; doctor on `/app/admin` → `/app/dashboard`; doctor on `/app/calendar`
  → `null`.
- `backend.recordAdminPatientAccess` — superAdmin actor appends an entry with denormalised
  patient/actor + `at`; a doctor/nurse actor returns state unchanged (no entry); two opens append
  two entries.
- `backend.adminAccessAuditEntries` — sort desc; empty state → `[]`.
- `accounts` — a superAdmin identity exists in `DEMO_ACCOUNTS`; `demoDoctorRefs()` still excludes it.

Component/RTL (jsdom):
- `AppShell` renders admin nav for a superAdmin identity and the clinical nav for a doctor (no
  Calendar/Patients tab for admin; no Admin tab for doctor).
- Admin patient-file view records exactly one access entry per open (superAdmin) and none for a
  doctor.
- Regression: doctor/nurse profile page renders without an admin console; superAdmin profile has
  no `AdminConsole` section (moved).

## Tasks (source of truth for "done")

- [x] T1 — Demo superAdmin account (`accounts.ts`) + tests
- [x] T2 — `AdminAccessAuditEntry` model + `emptyState` slice (`types.ts`)
- [x] T3 — `nav.ts` `navItemsFor` (+ tests) and wire `AppShell`
- [x] T4 — `authRedirect.ts` `landingFor` + `redirectForRole` (+ tests)
- [x] T5 — `backend.ts` `recordAdminPatientAccess` + `adminAccessAuditEntries` (+ tests)
- [x] T6 — `store.tsx` `recordAdminAccess` action + `adminAccessAudit` selector
- [x] T7 — Extract `AdminConsole` → `src/components/admin/AdminConsole.tsx`; remove from Profile
- [x] T8 — `/app/admin` home + `/app/admin/patients` lookup + `/app/admin/audit` view
- [x] T9 — `AuthGuard` role redirect + `LoginForm`/identity-switch use `landingFor`
- [x] T10 — Patient-file access logging + audit banner (superAdmin only)
- [x] T11 — Component/regression tests (AppShell nav, access logging, profile no-console)
- [x] T12 — Full test suite (633) + `next build` + lint green; browser QA; review fixes applied

## Review

`ecc:typescript-reviewer` (2026-07-09) — 1 CRITICAL (audit-log hydration race), 1 HIGH
(route-guard matched `/app/patients/new`+`/other`), 1 MEDIUM (frozen audit timestamps), 1 LOW
(missing AuthGuard role-redirect test). All fixed in commit `b636e40` with regression tests; the
MEDIUM was additionally verified in-browser; a re-review confirmed all three fixes correct with no
new CRITICAL/HIGH. Confirmed non-issues: AdminConsole move is behaviour-identical to the original;
clinical nav/landing/profile unchanged; no hooks-rules violations; `patientPermissions` untouched.
