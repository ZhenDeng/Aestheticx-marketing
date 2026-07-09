# Authorisation / Clause 68C direction PDF — completeness

**Date:** 2026-07-09
**Branch:** `feat/direction-pdf-completeness`
**Tier:** Core-architecture audit **Tier 2**, item 3 ("authorisation-document PDF incomplete").

## Problem

The generated authorisation document (the NSW Clause 68C "Direction to Administer") is the
platform's compliance artifact — it directs a nurse to administer a scheduled substance under a
doctor's authorisation. Today it renders **only** the Clause 68C direction fields
(`src/lib/demo/directionPdf.ts` / `direction.ts`). The 2026-07-08 core-architecture audit found it
is **missing** seven things the constitution expects on the authorisation document:

1. Patient **date of birth**
2. Patient **allergies**
3. Treatment **category** (per administration)
4. The **real expiry date** of the authorisation (not just the free-text "period")
5. **Approval status** (the document doesn't say it's an approved authorisation, or when)
6. A **prescriber signature** / authorisation attestation
7. References to the auto-generated **emergency authorisations** (adrenaline / hyaluronidase)

An incomplete authorisation document is a real compliance gap, distinct from the UI-visibility
quirks elsewhere in Tier 2.

## Key insight: everything is derivable, nothing is captured

All seven fields already exist in state **at the call site** and need no new capture, no store
mutation, and no backend/Cloud Function work:

- `patient.dateOfBirth` (`DateOfBirth {year, month, day}`) and `patient.allergies` (string).
- `authorisation.medication.category` (`ProductCategory`) → `categoryDisplayName()`.
- `authorisation.expiresAt` (epoch ms) — the true expiry.
- `authorisation.createdAt` (epoch ms) — "when approved" (an `Authorisation` only exists because a
  doctor approved the request; there is no separate status enum — **existence = approved**).
- `emergencies = store.activeEmergencyAuthorisations(id)` — already computed and rendered in an
  "Emergency authorisations" panel on the patient page (`patients/[id]/page.tsx:92,320`). Passed
  into the dialog, filtered to this direction's prescriber.

So this increment is **threading derivable data into the document** plus rendering it — entirely in
this repo (demo model + client PDF writer). No backend PR.

## The "signature" decision — typed electronic attestation, not a drawn signature

The audit says "prescriber signature" is missing. We deliberately render a **typed electronic
attestation** rather than a hand-drawn signature image:

- **Who exports the PDF is not the prescriber.** The Direction dialog is reachable by anyone with
  the patient file open — typically the injecting **nurse**, not the doctor. A signature pad at
  export time would capture *the exporter's* mark, which is misleading on a prescriber-authorisation
  document.
- **The real authorising act already happened.** The `Authorisation` exists *because* the doctor
  tapped Approve. The honest representation of prescriber authorisation is: prescriber name +
  "Electronically authorised" + the approval timestamp + the authorisation id — all derivable, all
  tied to the actual approval event.
- **Cost/keeps the writer simple.** `directionPdf.ts` is a hand-rolled single-font text PDF writer
  with no image/XObject support. Embedding a PNG signature would be net-new writer machinery for a
  worse artifact. Deferred deliberately (see Non-goals).

The consent flow's `SignaturePad` (a *patient* signature on consent forms) is unrelated and stays
untouched.

## Design

### Data model (`src/lib/demo/direction.ts`)

Extend `DirectionContent` with display-string fields (the model already holds pre-formatted strings
like `patientReviewedISO`, so we keep that convention — all formatting is pure and unit-tested here):

```ts
export interface DirectionContent {
  // …existing fields…
  patientDateOfBirth: string;      // "12/3/1991" (app convention: d/m/yyyy, no zero-pad)
  patientAllergies: string;        // "Penicillin" | "None recorded"
  authorisationStatus: string;     // "Approved 17 Jun 2026"
  authorisationExpires: string;    // "17 Dec 2026"
  prescriberAttestation: string;   // "Electronically authorised by Dr Elena Voss"
  emergencyAuthorisations: DirectionEmergencyRef[]; // [] when none on file
}

export interface DirectionEmergencyRef {
  label: string;   // "Adrenaline" | "Hyaluronidase"
  detail: string;  // "standing order · expires 8 Jul 2027"
}
```

Extend `DirectionAdministration` with `category: string` (e.g. `"Neurotoxin"`).

Pure helpers (new, in `direction.ts`, all unit-tested):
- `formatDob(dob: DateOfBirth): string` → `${day}/${month}/${year}` (matches `backend.ts:1123`).
- `formatDocDate(epochMs: number): string` → `"17 Jun 2026"` — fixed month names, read in the
  **jurisdiction timezone (`Australia/Sydney`)**. The inputs are real wall-clock instants
  (`createdAt`/`expiresAt`), and Sydney is always ahead of UTC, so reading UTC components would
  mis-date ~10–11h of every day to the previous calendar day. A fixed timezone is both
  deterministic across exporters and jurisdiction-correct (the live panel is free to use
  `toLocaleDateString()`; a document must not drift).
- `emergencyKindLabel(kind): string` — shared, so the patient-page panel and the direction agree
  (today the page has a private `EMERGENCY_LABEL` map; move/duplicate the source of truth here).

`buildDirectionDraft` gains inputs — `patientDob: DateOfBirth`, `allergies: string`,
`expiresAt: number`, `approvedAt: number`, `emergencies: EmergencyAuthorisation[]` — and formats
them into the new `DirectionContent` strings. `emergencies` is filtered by the caller to this
direction's prescriber (`e.doctorID === authorisation.doctorID`).

### Required-field gate (`missingDirectionFields`) — unchanged

None of the new fields gate export: DOB / category / expiry / approval / attestation / emergency
refs are always derivable, and **empty allergies is valid** (renders "None recorded", not a blocker).
The existing captured-field gate is untouched. Existing test fixtures that build a `DirectionContent`
literal get the new fields added (compile requirement), plus new assertions.

### PDF layout (`src/lib/demo/directionPdf.ts`)

Insert the new fields into the existing flowing-text layout, keeping the ink/gold/soft palette and
`field()` helper. Order:

```
DIRECTION TO ADMINISTER · NSW CL. 68C · {id}          (header, gold)
Treatment direction                                    (title)

Patient                {name}
Date of birth          {dob}            ← new
Allergies              {allergies}      ← new  ("None recorded" if empty)
Patient address        {address}
Prescriber             {name · phone}
Principal place of practice   {…}
Premises of administration    {…}
Responsible provider          {…}
Authorisation status   {Approved 17 Jun 2026}   ← new
Authorisation expires  {17 Dec 2026}            ← new
Patient reviewed       {iso}
Direction effective for {period}
Administrations        {count & intervals}

PER ADMINISTRATION — TO RECORD
  {substance}   {category} · {bodySite} · {route} · {quantity}   ← category new

EMERGENCY STANDING AUTHORISATIONS                      ← new section
  Adrenaline      standing order · expires 8 Jul 2027
  Hyaluronidase   standing order · expires 8 Jul 2027
  (or: "None on file." when empty)

PRESCRIBER AUTHORISATION                               ← new block
  Electronically authorised by {prescriberName}
  Approved 17 Jun 2026 · Authorisation {id}

For each administration the nurse must record: … Wording pending practitioner/legal
sign-off before clinical use.                          (footer, unchanged disclaimer)
```

### Dialog (`src/components/app/DirectionDialog.tsx`)

- New props: `emergencies: EmergencyAuthorisation[]` (patient-scoped; component filters to
  `authorisation.doctorID`). Patient DOB/allergies and authorisation expiry/approval are read from
  the `authorisation`/`patient` props already passed.
- Thread the new inputs into `buildDirectionDraft`.
- Preview panel (`<dl>`): add rows for Date of birth, Allergies, Authorisation status,
  Authorisation expires; add category to each administration line; add an "Emergency standing
  authorisations" list and a "Prescriber authorisation" block — so the on-screen preview matches the
  PDF exactly (existing invariant).

### Call site (`src/app/app/patients/[id]/page.tsx`)

Pass `emergencies={emergencies}` (already in scope at line 92) into `<DirectionDialog>`.

## Test plan (TDD)

**`direction.test.ts`** (pure):
- `formatDob({year:1991,month:3,day:12})` → `"12/3/1991"`.
- `formatDocDate` is UTC/deterministic (e.g. a known epoch → `"17 Jun 2026"`), independent of `TZ`.
- `buildDirectionDraft` populates `patientDateOfBirth`, `patientAllergies` ("None recorded" when
  blank), `authorisationStatus` ("Approved …"), `authorisationExpires`, `prescriberAttestation`,
  each administration `category`, and `emergencyAuthorisations` (mapped + labelled; `[]` when none).
- `missingDirectionFields` still returns `[]` for a complete direction and is **not** affected by
  empty allergies or absent emergencies.

**`direction-pdf.test.ts`** (bytes/content of the uncompressed stream):
- PDF text contains the DOB, allergies, category, formatted expiry, "Approved", the attestation
  ("Electronically authorised by …"), and each emergency label.
- "None recorded" / "None on file." render for the empty cases without throwing.
- Existing assertions (header/title/id, Clause 68C values, em-dash placeholder, WinAnsi
  transliteration, newline escaping, filename) still pass.

**Browser QA:** open a patient with an approved authorisation → 68C button → capture defaults →
Preview shows the new rows → Download → inspect the PDF's text stream carries every new field.

## Non-goals / deferred

- **Drawn signature image embed.** Would require adding image-XObject support to the hand-rolled PDF
  writer; the typed attestation is the better artifact (see decision above). Deferred, noted.
- **Backend `direction.ts` parity.** The backend renderer is the long-term "wire truth"; this
  increment enriches the web/demo client renderer. If/when the backend document adds these fields,
  reconcile then. (No live document is generated server-side today for the web path.)
- **AHPRA on the attestation.** Nice-to-have; the demo prescriber is resolved by name via
  `directionPrescriberName` and AHPRA isn't threaded through the direction path. Left out to keep the
  increment self-contained; can be added when profile data is in scope.

## Hygiene

Delete the gitignored macOS `" 2"` duplicate strays (`src/lib/demo/emergency 2.ts`,
`src/lib/demo/__tests__/emergency.test 2.ts`, and the two `docs/superpowers/**/*emergency* 2.md`) —
they're not tracked but `tsc` compiles the `.ts` ones (duplicate-export errors). Known repo gotcha.
