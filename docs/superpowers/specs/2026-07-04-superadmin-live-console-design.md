# Super-admin live console (accounts + create user) — design

**Date:** 2026-07-04 · **Reported:** "superadmin can only see demo accounts, and create
user/assign roles is disabled" (live web app, real super-admin account).

## Problem

`AdminConsole` on `/app/profile` renders the static `DEMO_ACCOUNTS` list in **every** mode and
its "Create user · assign roles" button is a hardcoded-disabled placeholder. A real super admin
signed into live mode therefore sees four fictional demo people and cannot administer anything.

Gap analysis (2026-07-04) shows the deployed backend already supports the whole flow:

- `users/{uid}` Firestore docs: rules allow `read` (get **and** list) for `superAdmin`
  (`firestore.rules` L21–22) — a live account inventory is one collection query.
- `createUser` callable (superAdmin-only): validates the full registration
  (`email, name, abn, businessName, phone, temporaryPassword ≥ 8, roles ≠ []`, `ahpra`
  mandatory when roles include doctor/nurse), creates the Auth record with a temporary
  password, sets claims `{roles, clinics, mustChangePassword: true}`, writes the profile doc,
  and queues a welcome email. **Roles are assigned at creation** — this is the deployed
  "assign roles" mechanism.
- `resetUserPassword` callable (superAdmin-only): emails a Firebase reset link.

**Out of scope (deployed-backend gaps, documented not papered over):**

- Changing roles on an *existing* user — no deployed callable does this (the Admin-SDK script
  `set-user-role.cjs` is an operator tool, not app surface). iOS has no such surface either.
- Creating `clinicAdmin`/`superAdmin` accounts from the web form. `clinicAdmin` only becomes a
  usable identity via a `clinics` map entry (needs a clinic picker — no clinic directory
  surface exists yet), and self-replicating `superAdmin` from a web form is a deliberate
  omission. The form offers **Doctor / Nurse** (matching `PRESCRIBER_ROLES`), multi-selectable.
- Demo mode stays read-only with the disabled button (iOS parity: iOS lists static demo
  accounts and its Create user button is an empty placeholder). Copy is updated so the
  disabled state reads as a demo limitation, not a broken feature.

## Change

### Model + pure helpers

- `types.ts`: `AccountRecord { id, name, email, roles: Role[], mustChangePassword: boolean }`
  and `DemoState.accountsByID: Record<string, AccountRecord>` (+ `emptyState`).
- `seed.ts`: seeds `accountsByID` from `DEMO_ACCOUNTS` (no emails in the demo cast — `email`
  seeded as `""`; the row hides an empty email line) so demo and live render through one path.
- `backend.ts`: `accountsInventory(state): AccountRecord[]` — sorted by name,
  case-insensitive, stable for equal names.
- New `src/lib/demo/userAdmin.ts`: client port of the backend's `validateNewUser`
  (`NewUserInput` → `string[]` of missing/invalid field names, same rules incl. the
  prescriber-AHPRA rule) so the form pre-validates identically to the Function and can mark
  fields inline before any network call.

### Live data (`mappers.ts`, `hydrate.ts`, `mirror.ts`)

- `mapAccount(id, data)`: users/{uid} row → `AccountRecord`. Tolerant of partial docs
  (missing name/email → `""`, roles filtered through the `Role` union, absent
  `mustChangePassword` → `false`).
- `hydrate.ts`: the existing superAdmin branch also runs `runQuery("users")`;
  `assembleState` maps rows into `accountsByID`. Non-superadmin hydration leaves it empty.
- `mirror.ts`: `mirrorCreateUser(input): Promise<{uid: string}>` → `createUser` callable;
  `mirrorResetUserPassword(email)` → `resetUserPassword`. Both target
  `australia-southeast1` via the shared `functions()` helper.

### Store (`store.tsx`)

- `accounts()` selector → `backend.accountsInventory(state)`.
- `createUser(input: NewUserInput): Promise<void>` — live only: callable then
  `setRefreshTick` so the new account appears from Firestore truth (no optimistic write —
  creation is server-authoritative like `bookAuthSlot`). Demo: rejects (button is disabled
  there, mirror of iOS).
- `resetUserPassword(email): Promise<void>` — live passthrough; demo rejects.

### UI (`AdminConsole` in `profile/page.tsx`)

- **Live:** rows from `store.accounts()` — monogram, name, email, role chips, an
  "Awaiting first login" chip while `mustChangePassword`, and a per-row "Reset password"
  action (sends the reset email; row-level busy/sent/error states). "Create user" is enabled
  and expands an inline card form (the page's existing inline-section pattern — no modal):
  Name, Email, Phone, ABN, Business name, AHPRA, Temporary password, and Doctor/Nurse role
  checkboxes. Submit pre-validates via `userAdmin.validateNewUser` (inline field marks),
  then calls `store.createUser`; success collapses the form and shows the temp-password
  reminder ("they'll be asked to change it on first sign-in"); Function errors surface in
  the form (e.g. email already in use).
- **Demo:** unchanged static `DEMO_ACCOUNTS` list + disabled button; caption now says user
  administration is live-only in the demo.

### Testing

- `userAdmin.validateNewUser` — port-parity cases mirroring `backend/functions/src/userAdmin.test.ts`
  (each missing field, short temp password, AHPRA required only for prescriber roles, valid input → []).
- `backend.accountsInventory` — sorting, empty state.
- `mapAccount` — full doc, partial doc, unknown roles filtered.
- `assembleState` — users rows land in `accountsByID`; absent rows → `{}`.
- Manual live QA: sign in as the real super admin, verify the real inventory renders and the
  create form validates; **no throwaway user is created against production** during QA.
