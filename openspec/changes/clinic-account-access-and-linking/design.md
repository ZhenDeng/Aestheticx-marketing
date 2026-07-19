# Design — clinic account access and clinic–doctor linking

## Context

Clinic accounts (auth-pdf-feedback-round-6) provision an auth user with `roles: ['clinicAdmin']` and claims `clinics: {clinicId: 'admin'}`, a `clinics/{id}` doc, and a membership doc. Two independent defects make them unusable:

1. Web hydrate ([hydrate.ts:376-381](../../../src/lib/firebase/hydrate.ts)) issues `appointments where ownerId == clinicId` as a hard query for each clinic claim. The `appointments` read rule (backend `firestore.rules`) proves reads via `ownerId == uid()`, `createdBy`, `counterparty.id`, `bookedById == uid()`, `inClinic(bookedById)`, or superAdmin — there is **no `inClinic(ownerId)` arm**, so the clinic-scope list query is unprovable and Firestore rejects it, aborting hydrate → the permission-denied banner. iOS `LiveBackend.hydrate` (AXData/LiveBackend.swift:138-146) issues the same query. `externalBusy`, `slotPublications`, and `availability` all already have clinic-member read arms; appointments is the outlier.

2. The admin console's create-relationship form is nurse-only. The whole rest of the pipeline (rules read arm, `setCooperationRelationship` callable coercing `counterpartyType === 'clinic'`, demo reducer, edit/remove rows, request-gate `cooperatingDoctorsFor`) already supports clinic counterparties. Only a clinic *directory* is missing: super-admin hydrate loads `users` but never `clinics`.

Constraints: two repos (web = this repo, backend = `~/Documents/AestheticX/backend`); other Claude sessions share the AestheticX tree, so backend work happens in a git worktree there. Firebase callables target `australia-southeast1`. Deploy order must be safe in both directions.

## Goals / Non-Goals

**Goals:**
- A freshly created clinic account logs in and lands on its dashboard.
- Clinic members can list their clinic's calendar (web + iOS, via the rules fix).
- A super admin can link a clinic to a doctor from the console; the link gates requests exactly like nurse links.

**Non-Goals:**
- Linking a doctor at clinic-creation time (the `createUser` atomic link stays nurse-only; clinics are linked post-creation via the cooperation section).
- iOS code changes (the rules deploy alone fixes iOS clinic members).
- A general clinic-management UI (rename, membership editing, etc.).

## Decisions

1. **Fix the rule, not just the client.** Add `|| inClinic(resource.data.ownerId)` to the appointments read rule. Alternative — dropping the clinic-scope query client-side — would leave clinic calendars permanently empty and leave iOS broken. The clinic-member grant matches the documented product behaviour ("Appointments owned by the user or their clinics") and the established `inClinic` pattern on sibling collections. `inClinic` (any member) over `isClinicAdmin` because employees/contractors work the clinic calendar too — same audience as `externalBusy`.

2. **Make the web's clinic-scope appointments query best-effort (`runQuerySafe`).** Matches the existing `bookedById` best-effort precedent in the same function, makes web-first deploys safe, and turns any future rules regression into a degraded scope instead of a login lockout. The own-uid query stays hard so real outages still fail loudly for everyone.

3. **Clinic directory via super-admin hydration of `clinics`** (`runQuerySafe("clinics")` → new `clinicsByID` state slice + `clinics()` store selector; demo seeds Lumière). Alternatives considered: (a) deriving clinics from the `users` rows' claims map — rejected: requires widening `AccountRecord`/`mapAccount` and gives ids without authoritative names; (b) a new `listClinics` callable — rejected: rules already allow super-admin reads of `clinics`, so a callable is needless backend surface. `runQuerySafe` keeps hydration resilient if rules and web ever skew.

4. **Counterparty type selector in the existing create form** (radio/select: Nurse | Clinic) rather than a separate clinic form — one flow, the submission already parameterises `counterpartyType`. Empty-directory states mirror the existing "No nurse accounts yet." copy.

## UI design (Phase 2 output)

The create-relationship form extends the console's existing idiom — no new visual language:

- **Counterparty type toggle** (new row above the field grid): reuse the create-user form's segmented pill pattern exactly (`flex gap-1.5`; buttons `rounded-btn px-3 py-1.5 text-sm`; selected = `background: var(--color-tint)` + `text-card`; unselected = `border border-line text-ink-soft`; `aria-pressed`). Labels: **Nurse**, **Clinic**.
- **Counterparty picker**: the existing second grid cell swaps its micro-label and options with the toggle — "Nurse" (accounts with the nurse role, unchanged) or "Clinic" (the clinic directory, `name` with non-blank fallback). Doctor select and price-override cells are untouched.
- **Empty states**: the early-return guard stays for an empty doctor directory ("No doctors in the directory yet."). An empty directory for the *selected counterparty type only* renders a message in place of the picker — "No nurse accounts yet." / "No clinic accounts yet — create a clinic account first." — with Create disabled, keeping the toggle visible so the admin can switch type.
- **Switching type** resets the counterparty selection to the first entry of that type's directory.

## Risks / Trade-offs

- [Rules widen clinic-calendar reads to all members] → intended: same audience as `externalBusy`; appointments carry no clinical record beyond scheduling data the clinic already operates on.
- [`runQuerySafe` can mask a real clinic-calendar outage] → scope-limited by design; the hard own-uid query plus the live subscriber's `onScopeError` banner still surface problems.
- [Two-repo deploy coordination] → web is safe first (best-effort); rules deploy completes the fix. Same pattern as PRs #97/#100.
- [Demo/live drift in the clinic directory] → demo seeds only Lumière; tests cover both modes.

## Migration Plan

1. Backend PR (worktree in AestheticX): rules arm + rules tests → deploy `firestore:rules`.
2. Web PR (this repo): hydrate best-effort clinic scope, clinics slice, admin picker + tests → Vercel deploy (safe before or after step 1).
3. Rollback: each change is independently revertible; reverting the rules arm re-introduces the lockout only if the old web bundle is also restored.

## Open Questions

- None blocking. (Whether clinic accounts should also get an atomic doctor link at creation is deferred; the console link covers the reported need.)
