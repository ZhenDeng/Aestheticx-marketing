# iOS parity sweep — design

**Date:** 2026-07-04 · **Spec source:** all 13 capabilities in
`~/Documents/AestheticX/openspec/specs/` · **Parity target:** what the iOS app *implements*
(verified in Swift source), not just what the spec text aspires to.

## Audit method

Four parallel requirement-by-requirement audits (100 requirements) of the web port against
the specs, then an iOS-source verification pass on every disputed item. False positives
discarded with evidence: web already has signed-form delete
(`forms/[formId]/page.tsx` → `store.deleteForm`) and follow-up Done/Ignore
(`calendar/page.tsx:167-181`); iOS does **not** implement email-invoice sending (ShareLink
only — UI-only button), so it is not a parity gap; push/booking notifications are
APNs-served on iOS (web slice out of scope); background call ringing is PushKit/CallKit
(iOS-native by definition); the public booking form deliberately lives in the backend repo.

## Verified gaps (iOS has it — web doesn't), as increments on this branch

- **A. Prescriber-only note visibility** — iOS `PatientPermissions` sets
  `canViewGeneralNotes=false` for a doctor who is only in `prescribingDoctorIDs`
  (treatment notes remain visible/writable); super admin views all, writes none. The web
  `patientPermissions` has no `canViewGeneralNotes` at all and the note stream never
  filters. Port the flag + filter the stream + tests.
- **B. Profile cluster** — iOS `ProfileView`: avatar upload, AHPRA (doctor/nurse), ABN,
  phone, address; identity/role switcher cards; live-mode Delete account; billing reached
  via Profile (not a main tab); plus `FirstLoginPasswordView` (`mustChangePassword` gate,
  password policy: 8+ chars/upper/number/symbol → `completeFirstLogin` callable, already
  deployed) and the super-admin read-only `AdminConsoleView` (accounts list; iOS's
  "Create user" button is an empty placeholder — NOT ported). Web has none of these
  surfaces (`selectIdentity` exists in the auth context with no UI).
- **C. Patient records** — iOS `PatientAvatar`/`PatientAvatarPicker` (72pt file header,
  56pt list, monogram fallback, upload gated on `canEditDetails`); doctor patient list
  split into own + grouped "Other patients" subpage (`PatientListView` split.own /
  OtherPatientsView). Web has neither.
- **D. Billing** — iOS `BillingView` custom-timeframe date-range compute +
  `ClinicStatsView` (authorisations approved, patients served, repeats used, over a date
  range, clinic-admin only). Web `billingSummary` is fixed calendar months; no clinic
  stats surface despite the `canViewBusinessStats` permission existing.
- **E. Authorisation Direction + PDF** — iOS `Direction` struct captures the NSW Clause
  68C fields (premises of administration, prescriber principal place, patient-reviewed
  date, administration count/intervals) with `missingFields` gating, and
  `AuthorisationPDFRenderer` exports the Treatment Authorisation document. Web has consent
  PDFs (`form-pdf`) but no Direction model or authorisation PDF.
- **F. Request builder** — iOS `ProductPickerView` "Recently used" row
  (`RecentlyUsedStore`) and "Other / compounded medication" free-text product entry with
  custom area text. Web request builder has neither.

## Ground rules for every increment

Match the iOS **wire format** (read the Swift `LiveBackend`/model encoding before adding
any Firestore field); demo+live parity (pure state fn + store + mirror + hydrate); TDD on
the pure layer; one commit per increment; typescript-reviewer pass per increment; suite +
tsc + build green before each commit. One PR for the sweep.
