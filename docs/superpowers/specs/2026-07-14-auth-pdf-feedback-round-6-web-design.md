# Auth/PDF feedback round 6 — web parity + console fields

**Date:** 2026-07-14
**Branch:** `feat/authorisation-premises-clinic-feedback`
**Spec of record:** `~/Documents/AestheticX/openspec/changes/auth-pdf-feedback-round-6/`
(proposal/design/tasks). The iOS + backend side is built on AestheticX branch
`feat/auth-feedback-batch-2026-07`; that spec explicitly defers the web console/app work
to this repo ("the console form fields are a follow-up in that repo"). This doc covers
ONLY the web slice.

## Owner feedback → where it lands

| Feedback item | Backend/iOS (other repo) | This repo (web) |
|---|---|---|
| Jenn Lee phone/place, Zhexia + Danni default premises | backfill script (task 8.1 done; 8.2 deploy/run pending) | nothing — data, not web code |
| Multiple premises per RN, CRUD, dashboard selection | iOS done | premises model + profile manager + dashboard switcher |
| Selection persists across logout/login | `users/{uid}.selectedPremiseId` (D3) | hydrate + mirror the same field |
| PDF uses selected premise | request stamps `premise` at submission | stamp in demo backend + send on wire |
| PDF on approval → treatment notes (one file, all meds) | `approveRequest` renders server-side, uploads, writes note `authpdf-{requestId}` | demo-mode parity note w/ client-rendered PDF; live shows the server note |
| Route of administration per material (5 options) | wire `items[].route`, validation | request-builder selects + submit gate + mappers |
| Date reviewed = approval date | `authorisations.reviewedAtMillis` stamped | demo stamp + derive direction review date (no capture) |
| Essential info at account creation | `validateNewUser` extended (task 6.1 done) | console form: principalPlace, premises, clinic type |
| Clinic role | `createUser accountType:'clinic'` (D5); permission matrix verified as-is | console "Clinic" account type; no permission change |
| Booking interface + doctor call schedule | iOS tasks 7.x | nurse dashboard CTA + doctor "Upcoming authorisation calls" |
| millilitres→mls, HarmonyCa/Radiesse units, Teoxane Redensity 1 | Swift+TS seeds done; live rows via backfill | `catalog.ts` static fallback + `unitSuffix` |

## Wire contracts to mirror exactly (backend truth)

- `ROUTES_OF_ADMINISTRATION = ['intradermal','subdermal','subcutaneous','intramuscular','supraPeriosteal']`,
  labels `Intradermal / Subdermal / Subcutaneous / Intramuscular / Supra-periosteal`
  (backend `domain.ts`). `MedicationItem.route?: string|null` — optional for legacy decode;
  UI requires it for new submissions; renderers print "—" when absent.
- `PremiseStamp {id, name, address}` on `authRequests.premise` (stamped at submission,
  immutable) and copied to each `authorisations` doc; `reviewedAtMillis` stamped at approval.
- `users/{uid}`: `principalPlace` (doctor), `premises: [{id,name,address}]`,
  `defaultPremiseId`, `selectedPremiseId` (nurse). Owner-writable (rules task 6.3 done).
  Dangling `selectedPremiseId` → fall back to `defaultPremiseId` → first premise.
- `validateNewUser`: + `accountType?('clinic')`, `clinicAddress?`, `principalPlace?`,
  `premises?[]`, `clinics?`. Clinic: no AHPRA, name = clinic name, address + clinicAdmin
  role required. Doctor: principalPlace required. Nurse: ≥1 complete premise.
- Approval note (server): id `authpdf-{requestId}`, kind `treatment`, title
  `Treatment authorisation — {d MMM yyyy}`, attachment
  `{fileId: patients/{pid}/authorisations/{reqId}.pdf, displayName: title+.pdf, mimeType: application/pdf}`,
  `consumedAuthorisationIds: []`, author = approving doctor.
- Catalog: `millilitres` label "mls"; Radiesse + HarmonyCa `unit: millilitres`;
  "Teoxane Redensity 1" with **pinned id** `skinbooster-redensity-1` (backend
  `productSeed.ts` precedent — slug would otherwise change and orphan references).
  Consequence accepted on both platforms: their area list flips to the filler-like list
  (`treatmentAreasFor` keys on unit).

## Web design

### 1. Catalog (`src/lib/demo/catalog.ts`)
`unitSuffix("millilitres")` → `"mls"`; COLLAGEN rows Radiesse/HarmonyCa → `"millilitres"`;
Redensity rename with pinned id (explicit literal like the backend seed). No UI changes —
every display site already goes through `unitSuffix`/catalog names.

### 2. Route of administration
- `types.ts`: `MedicationItem.route?: string`; export `ROUTES_OF_ADMINISTRATION` +
  `ROUTE_DISPLAY_LABELS` (wire strings + labels, mirroring backend `domain.ts`).
- `mappers.ts`: `mapMedication` reads `route` (string, else undefined); `encodeMedication`
  writes `route: m.route ?? null`.
- Request builder: both `LineEditor` and `OtherLineEditor` get the same required
  `<select>` — placeholder "Select route…", five options (iOS routePicker parity).
  The old free-text route→dosage fold on Other lines is REPLACED by the first-class field
  (`composeOtherDosage` deleted — iOS commit() no longer folds). `canSubmit` additionally
  requires `l.item.route` on every line.
- `direction.ts`: per-administration route = `ROUTE_DISPLAY_LABELS[m.route]` when present,
  else the captured all-items route (legacy). `DEFAULT_CAPTURED_FIELDS.route` `"IM"` → `""`
  (owner: route is never defaulted); the capture Field renders only when some medication
  lacks a stored route.

### 3. Premises + profile fields
- `types.ts`: `Premise {id,name,address}`; `UserProfile` + `principalPlace: string`,
  `premises: Premise[]`, `defaultPremiseId?: string`, `selectedPremiseId?: string`;
  `UserProfileEdit` gains all four. `AuthorisationRequest.premise?: Premise|null`;
  `Authorisation.premise?: Premise|null`, `reviewedAt?: number`.
- `backend.ts` (pure): `activePremise(profile)` (selected → default → first → null);
  `savePremise` (add or edit by id), `deletePremise` (guard: cannot delete the last
  premise; repoint default/selected when they dangle), `selectPremise`. `submitRequest`
  stamps `premise` from the nurse's active premise for INDEPENDENT context (clinic context
  stamps null — the server/renderer always uses the clinic address, mirroring
  `buildApprovalDocumentModel`). `approveRequest` stamps `reviewedAt: now` + copies
  `request.premise` onto each Authorisation.
- `hydrate.ts` reads the four fields; `mirror.ts` `mirrorUpdateProfile` passes them through
  (rules already allow). Selection persistence = the users-doc field, NOT localStorage
  (cross-device, survives sign-out — backend D3).
- Seed: Sarah Chen gets two premises (default first) so demo exercises the switcher;
  `LUMIERE` gains an address constant used for clinic-context display.
- UI: **Profile** page (nurse) "Premises of administration" card — list rows
  (name, address, Default badge), inline add/edit form, delete with last-premise guard;
  (doctor) "Principal place of practice" field beside phone/AHPRA. **Dashboard** (independent
  nurse): compact "Working from" selector card listing premises as radio-style rows.
- `DirectionDialog`: premises prefilled from `authorisation.premise` (stamped truth);
  reviewed date no longer captured (derived: `reviewedAt ?? createdAt`, formatted ISO);
  prescriber phone/place prefill from `profileForUser(doctorID)` when non-empty.

### 4. Demo-parity approval note + PDF (`src/lib/demo/approvalPdf.ts`)
Pure port of the backend's `buildApprovalDocumentModel` (same rows/labels: Product /
Area(s) / Volume / Timing / Route, premise resolution clinic-address-first, "mls" volumes,
em-dash placeholders) rendered with the existing hand-rolled text-PDF writer machinery
(directionPdf.ts conventions). Demo `approveRequest` gains `generateApprovalNote` option
(default true; store passes `!live`): writes the Note (deterministic id
`authpdf-{requestId}`, attachment dataUrl for demo download). Live mode: the deployed
Cloud Function writes the real note; it appears on next hydrate (same convention as
emergency authorisations — no optimistic fabrication). NOT shown under Active
authorisations (owner: audit file lives in treatment notes) — no patient-page change
needed since notes render attachments already.

### 5. Console create-user (`userAdmin.ts` + `AdminConsole.tsx`)
- `userAdmin.ts`: verbatim re-port of the extended backend validator (accountType /
  clinicAddress / principalPlace / premises rules above).
- `CreateUserForm`: "Account type" segmented control — Practitioner | Clinic.
  Practitioner: existing fields + roles; checking **Doctor** reveals required
  "Principal place of practice"; checking **Nurse** reveals a required premises editor
  (≥1 row of name+address, add/remove; first = default). Clinic: name field relabelled
  "Clinic name", AHPRA hidden, required "Clinic address", roles forced `['clinicAdmin']`
  (hidden). Payload goes through the same `mirrorCreateUser`.
- Demo mode keeps the static read-only cast (unchanged).

### 6. Booking surfaces
- Dashboard, nurse: prominent "Book an authorisation call" card → `/app/availability`
  (existing BookConsult flow: cooperating doctors, open slots, ad-hoc now/scheduled).
- Dashboard, doctor: "Upcoming authorisation calls" list — appointments where
  `type === "authSlot"`, owner = the doctor, status confirmed, end ≥ now; chronological;
  each row: date + time, patient/lead title (`appointmentTitle`), booked-by where present.
  Pure selector `upcomingAuthCalls(state, doctorID, now)` in backend.ts.

## Out of scope (other repo / later)
- Deploy + backfill (AestheticX tasks 8.2) — the three practitioners' data and live
  product rows land there; existing PDFs pick them up at next export by design (D2).
- Clinic-admin permission matrix — verified unchanged (backend D5).
- Firestore rules — already updated backend-side (task 6.3).

## Test plan (TDD; Vitest)
- catalog: mls suffix, unit rows, pinned Redensity id + rename, area-list flip.
- routes: map/encode round-trip; builder gate (no route → cannot submit) via existing
  request-builder/store tests; direction per-item route + legacy fallback.
- premises: activePremise fallback chain; CRUD incl. last-premise guard + repointing;
  submitRequest stamps (independent) / null (clinic); approveRequest stamps reviewedAt +
  premise; hydrate/mirror field round-trip (mapper-level).
- approval note: model assembly (rows, premise resolution, em dashes), deterministic note
  id/title/attachment, demo approve writes it once (idempotent id), live approve does not.
- userAdmin: the backend validator's cases re-ported (clinic no-AHPRA, nurse premises,
  doctor principalPlace).
- upcomingAuthCalls: filters type/status/time, sorts.
- Existing suites stay green (fixtures gain `route`/new profile fields where compile
  requires).

## Risks
- "mis" (HarmonyCa) treated as "mls" — same call as the backend (design D6), flagged in PR.
- Live premises selection needs the deployed rules (task 6.3 merged, deploy 8.2 pending);
  until deployed, live writes fall into the existing lastSyncError banner path. Demo
  unaffected.
- Live approval note visibility depends on the deployed round-6 `approveRequest`; until
  then live approvals simply don't produce the note (unchanged behaviour).
