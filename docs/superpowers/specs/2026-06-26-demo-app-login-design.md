# Design: AestheticX demo app — login + core clinical loop

**Date:** 2026-06-26
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (Next.js 16.2.9 marketing site)
**Source of truth for data/behaviour:** the iOS app at `/Users/zhendeng/Documents/AestheticX` (`AestheticXKit/Sources/AXDomain`, `AXData/InMemoryBackend`, `AXFeatures/Session.swift`) and `openspec/specs`.

## Problem

The marketing site is a static showcase. The user wants a **login link + page**, and after login an
authenticated area that demonstrates the product's functionality described in the openspec specs,
**sharing the same data as the iOS app**.

The full product is a 13-subsystem clinical SaaS (real backend, Firestore, video, e-signing). Building
that for real is out of scope. This design delivers an **interactive demo**: a real login and a
role-tinted in-browser app shell that faithfully reproduces the iOS app's **domain model, rules, and
demo seed data**, running entirely in-memory with no backend.

## Decisions (agreed during brainstorming)

1. **Interactive demo app**, not a real persistent backend. Mock/in-memory only.
2. **Login** with three **preset role accounts** (nurse / doctor / clinic admin). Optional password
   field accepts anything. Selecting an account tints the whole app to that identity.
3. **Seeded in-memory data that resets on hard reload.** Client-side navigation preserves state.
4. **Scope = the core clinical loop:** login → patients → patient file → clinical notes → treatment
   authorisation (nurse requests → doctor approves) → calendar/appointments.
5. **"Same data as the iOS app" = same shape + same seed (Option A).** Port the iOS demo's domain
   types and `SessionState.demoBackend` seed into TypeScript. NOT a live shared Firestore.

## Naming note

The public marketing copy (`src/lib/content.ts`) deliberately uses neutral labels ("Nurse A",
"Clinic A") and no real names. The **authenticated demo app** instead reuses the iOS app's demo
identities and patients (Sarah Chen, Dr Elena Voss, Lumière Clinic, Amara 'Mara' Boyd, …) because the
user explicitly asked for "the same data as the iOS app." This is acceptable: it sits behind login,
is clearly demo data, and contains no real patients. Marketing copy is left untouched.

## Architecture

New authenticated area inside the same App Router project, isolated from marketing code.

```
src/app/login/page.tsx              Login screen (3 preset accounts)
src/app/(app)/layout.tsx            CLIENT layout: mounts providers, auth guard, app chrome (role-tinted)
src/app/(app)/dashboard/page.tsx    Landing after login (role-aware summary)
src/app/(app)/patients/page.tsx     Searchable patient list
src/app/(app)/patients/[id]/page.tsx  Patient file: demographics, alert, consent, active auths, notes
src/app/(app)/authorisations/page.tsx Doctor review inbox / nurse open requests
src/app/(app)/calendar/page.tsx     Day/week appointment list

src/lib/demo/types.ts               Ported domain types (Patient, Appointment, Note, Authorisation…)
src/lib/demo/seed.ts                Ported SessionState.demoBackend seed (accounts, patients, …)
src/lib/demo/backend.ts             Pure domain logic ported from InMemoryBackend (the rules)
src/lib/demo/store.tsx              React context + useReducer wrapping backend; resets to seed on mount
src/lib/demo/auth.tsx               DemoAuthContext: { account, identity } | null; sign in/out
```

- **In-memory persistence:** providers live in the `(app)` client layout. Client-side `<Link>`
  navigation keeps them mounted, so edits persist across screens within a session. A hard refresh
  remounts → state resets to seed → if no session, the guard redirects to `/login`.
- **Route group `(app)`** keeps the authenticated layout (providers, chrome) separate from marketing
  pages, which keep their own `SiteNav`/`SiteFooter`.

## Domain model (ported from `AXDomain`)

Faithful TypeScript ports — same fields, same enum raw values (wire-compatible with the iOS app):

- `Role` = `"doctor" | "nurse" | "clinicAdmin" | "superAdmin"`.
- `Identity` = `{ user: UserRef; role: Role; context: PracticeContext }` where context is
  `{ kind: "independent" } | { kind: "clinic"; clinic: ClinicRef }`. `badge` = `"Sarah Chen"` or
  `"Sarah Chen @ Lumière Clinic"`.
- `Patient` — id, givenName, lastName, dateOfBirth, gender, address, phone, email, allergies,
  currentMedications, owner (`doctor|nurse|clinic` id), prescribingDoctorIDs, alert?, preferredName?.
  Computed: `fullName` (`Given Last`), `displayName` (`Given 'Preferred' Last`), `calendarName`
  (`Preferred Last`), `hasAlert`.
- `AuthorisationRequest` — id, patientID, nurse, doctorID, context, items: MedicationItem[],
  status (`pending | needsEdit | approved`), createdAt, patientSummary.
- `Authorisation` — id, requestID, patientID, doctorID, nurseID, clinicID?, medication,
  repeatsRemaining, expiresAt. `isActive(at)` = repeatsRemaining > 0 && not expired.
- `Note` — id, patientID, kind (`general | treatment | aftercareRecord`), title, body, attachments,
  createdAt, authorID, authorBadge, consumedAuthorisationIDs, medications, deliveryStatus?.
- `Appointment` — id, type, ownerID, dateISO, startMinute, endMinute, status, patientID?,
  patientName?, lead?, appointmentNote?.

## Domain rules (ported from `InMemoryBackend`, the source of truth)

These are pure functions and get **TDD coverage**:

1. **Visibility / permissions** (`PatientPermissions`): which patients an identity can view; who can
   write general vs treatment notes; admin has no clinical write.
2. **Patient search** (`SearchQuery.classify`): name vs DOB (`dd/mm/yyyy`) vs phone (digits).
3. **Submit request** — nurse only, from a viewable patient, status `pending`.
4. **Approve request** — doctor only, must own the request, must be `pending`. Issues per-medication
   authorisations (**5 repeats, 6-month expiry**), records **one billing event** (1 approved request =
   1 billable count), and adds the doctor to the patient's `prescribingDoctorIDs`. **No flat reject** —
   the alternative is `requireEdit` (status → `needsEdit`, nurse may resubmit).
5. **Treatment note consumes repeats** — ticking active authorisations decrements one repeat each and
   records usage; all-or-nothing (fails leaving no trace).

## Auth (demo)

- `/login` lists the iOS demo accounts: **Sarah Chen — Nurse** (independent + Lumière), **Dr Elena
  Voss — Doctor**, **Ava Lim — Clinic Admin** (Ruby Walsh / Platform Admin optional). Password field
  optional, accepts anything.
- Selecting an account sets `DemoAuthContext` and routes to `/dashboard`. The `(app)` layout reads the
  role and sets `--color-tint` / `--color-tint-soft` (nurse→rose, clinic→sage/slate, doctor→umber),
  reusing the `RoleTintShowcase` mechanism. Sign out clears the session and returns to `/login`.
- Switching role = sign out and pick another account — this is how the nurse→doctor handoff is demoed
  (Sarah raises Claire's Profhilo request; sign in as Dr Voss to approve it).

## Seed data (ported verbatim from `SessionState.demoBackend`)

- **Clinic:** Lumière Clinic (`clinic-lumiere`).
- **Patients:** Amara 'Mara' Boyd (clinic; alert: anaphylaxis to lignocaine; one approved auth +
  treatment note + general note), Claire 'Coco' Donovan (Sarah independent; **pending** Profhilo
  request to Dr Voss), Grace Huang (Dr Voss's private patient).
- **Appointments (today):** Dr Voss auth slot 09:00, treatment 10:00 (Coco Donovan), lead consult
  11:00 (Mara Pearce); clinic calendar items 09:30/10:30/12:00.
- **Billing:** clinic script price 8500c; billable scripts s-amara, s-claire.

## Marketing site integration

- Add **"Log in"** to `NAV_LINKS` in `src/lib/site.ts` → `/login`, and a CTA button in the nav.
- No other marketing changes.

## Testing

Repo has no test runner today. Add **Vitest + React Testing Library**.

- **TDD (tests first)** for `src/lib/demo/backend.ts` — permissions, search classification, request
  approval (repeats/expiry/billing/no-flat-reject), repeat consumption. Mirror the iOS
  `AuthorisationTests` / `BillingAndNoteTests` / `IdentityAndPermissionTests` cases.
- **Light component tests** for the auth guard redirect and login → dashboard.
- **UI screens verified live** via the preview tools (snapshots/screenshots), not exhaustively
  unit-tested.

## Out of scope (later passes)

Consent-form e-signing UI, prescribing catalog browser, billing invoice/PDF generation, email
delivery, file/photo upload, video teleconsult, real backend/persistence, super-admin tools,
follow-up reminders, calendar drag/resize. Shown as labelled "preview" affordances where helpful.

## Risks

- **State-reset surprise:** users may expect edits to persist; mitigated by a small "Demo — resets on
  refresh" marker in the app chrome.
- **Model drift:** the TS port can fall behind the Swift source. Mitigated by keeping types/seed in
  one `src/lib/demo/` folder with a header comment pointing at the Swift source files.
- **Next 16 specifics:** per `AGENTS.md`, consult `node_modules/next/dist/docs/` before using App
  Router APIs (route groups, client layouts, redirect) during implementation.
