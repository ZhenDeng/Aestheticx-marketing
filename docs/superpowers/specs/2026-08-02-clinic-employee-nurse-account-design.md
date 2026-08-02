# Clinic-employee-only nurse account (no ABN) — design

Date: 2026-08-02
Owner request (02/08): a nurse who registers **without an ABN** can only ever be a clinic
employee — never an independent clinician. No patient file of her own; she accesses clinic
data, edits clinic patient files and the clinic calendar on behalf of the clinic admin; no
billing (billing belongs to the clinic admin); she writes general + treatment notes and
sends authorisation requests to doctors **on behalf of the clinic**; approved authorisations
are shared with every clinic employee (any nurse/doctor employed by that clinic can tick
medications from her approved treatment authorisations).

## What already exists (no change needed)

- A clinic-context nurse identity already edits clinic patient files, writes general +
  treatment notes, and manages the clinic calendar (`patientPermissions` backend.ts:227–228,
  `appointmentOwnerScope` backend.ts:1011).
- Requests raised under a clinic identity already carry `context: {kind:"clinic"}` and the
  approved `Authorisation` is stamped `clinicID` (`approveRequest` backend.ts:533).
- Clinic-scoped authorisations are already tickable by **any** member acting in that clinic
  context — nurse, doctor, whoever reaches the treatment-note form (`canUseAuthorisation`
  backend.ts:795–798; live hydrate reads authorisations member-wide, hydrate.ts:288–298).

So the deliverable is the **account type**, not the sharing model: an account-level
`employeeOnly` flag that (a) suppresses the independent identity, and (b) removes billing.

## Not a new Role

`Role` stays `doctor|nurse|clinicAdmin|superAdmin`. The new type is a **nurse account with
`employeeOnly: true`** — claims/users-doc flag, not a fifth role. Every clinic-nurse
permission surface keeps working untouched; the flag only gates identity derivation and
billing surfaces.

## Live encoding (claims + users doc)

- Claims: `{ roles: ["nurse"], employeeOnly: true, clinics: { [clinicId]: "employee" }, mustChangePassword }`.
  `roles` still carries `nurse` so every roles-driven surface (admin console, employment
  management, claims self-heal) keeps working; the web's `identitiesFromClaims` **skips the
  independent nurse identity when `employeeOnly`** — the account only ever holds clinic
  nurse identities.
- users/{uid} doc mirrors `employeeOnly: true` (claims-authority field, rules-immutable like
  roles/clinics/abn) so `syncUserClaims` / `completeFirstLogin` re-derivation preserves the
  flag — otherwise a self-heal would silently mint an independent identity.
- No ABN, no business name on the account.

## Creation (super-admin console; there is no self-service signup)

`CreateUserForm`, practitioner + nurse role: new checkbox **"Clinic employee only (no ABN)"**.
When checked:
- Hidden: ABN, Business name, Premises of administration (the clinic's premise applies —
  clinic-context requests stamp `clinicPremise`, never a personal premise), Supervising
  doctor (her requests ride the clinic's doctor relationships, not personal ones).
- Shown + required: **Employing clinic** select. The membership is granted **atomically at
  creation** — an employee-only nurse with zero clinic memberships resolves zero identities,
  which is a login lockout (the recurring clinic-scope-lockout family).
- Validator (web port + backend, kept mirrored): with `employeeOnly` — roles must be exactly
  `["nurse"]`, `abn`/`businessName`/`premises` not required, `employingClinicId` required.
  AHPRA stays required (she is still a registered practitioner).

## Billing removal (employee-only accounts)

Billing belongs to the clinic admin. For an employee-only nurse:
- Nav: no **Invoice** tab (`navItemsFor` gains an `employeeOnly` option).
- `/app/billing` deep link renders an explanatory stub (same pattern as superAdmin).
- Patient file: no Account section (wallet/top-up/checkout) and no Invoice-client section;
  `PatientAccountSection` + `ClientInvoiceComposer` self-guard so the calendar check-out
  mount is covered too.
- `ServiceInvoiceComposer` ("invoice the clinic") self-guards — no ABN means she cannot
  issue a tax invoice to anyone, her pay is the clinic's payroll problem.
- Dashboard "approved this month" tile stops linking to /app/billing for her.
- The flag reaches components via the auth context (`useDemoAuth().employeeOnly`): live from
  token claims (like `mustChangePassword`), demo from the account's `employeeOnly` flag.

## Safeguards

- Zero-identity sign-in (e.g. employment revoked later): the login page shows "no workspace
  assigned — ask your administrator" instead of silently doing nothing.
- Employment view: removing an employee-only nurse's **last** membership warns that it locks
  the account out (still allowed — that is how an admin deactivates her).
- Employment rows label employee-only accounts ("Clinic employee") so admins can tell them
  from ABN-holding nurses.

## Demo cast

New account appended last (index stability): **Mia Torres — Nurse (clinic employee)**,
`employeeOnly: true`, single identity = nurse @ Lumière. Ruby Walsh stays an ABN-holding
clinic nurse (17 tests reference her billing-capable behaviour). `createUser` remains
live-only in demo.

## Out of scope / follow-ups

- iOS parity: iOS reads the same claims but does not yet skip the independent identity for
  `employeeOnly` — needs an App Store release; until then an employee-only nurse on iOS
  would see an (empty) independent workspace.
- Bookings tab: a clinic-only nurse's personal booking link books onto her personal (never
  rendered) calendar — pre-existing for Ruby-type accounts, unchanged here.
- Backend PR must deploy **before** the web PR is exercised live (createUser new fields).
