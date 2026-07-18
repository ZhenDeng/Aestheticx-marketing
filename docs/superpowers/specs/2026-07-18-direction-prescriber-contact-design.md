# Prescriber Contact on the Clause 68C Direction — Design

**Goal:** Let a **nurse** export an NSW Clause 68C direction with **Prescriber phone** and
**Principal place of practice** already filled in. Today both are blank for a nurse in live, so
`missingDirectionFields` blocks the export until the nurse retypes details they may not hold.

Fixed by having `approveRequest` **stamp** the prescriber's contact onto every authorisation it
writes, read from the approving doctor's `users/{uid}` doc. The web then prefers the stamp over
its existing profile lookup.

## Root cause (verified both repos)

- `DirectionDialog.tsx` prefills from `store.profileForUser(authorisation.doctorID)`. This works
  in demo (whole cast seeded) and when the **doctor** exports their own direction.
- It fails for a nurse in live: `hydrate.ts:228` loads only the **caller's own** `users/{uid}`
  doc, so `profileForUser` returns its all-blank default (`src/lib/demo/backend.ts:1254`).
- Nothing else carries it. `listDoctors` returns only `{doctorId, doctorName}`
  (`mirror.ts:313`), and neither the `authRequests` nor the `authorisations` doc stamps
  prescriber contact (`mapAuthorisation`, `mappers.ts:139`).

## Why stamping, not a lookup

Stamping snapshots the prescriber's details **as they were when the direction was authorised**,
which is what a legal document should record. Extending `listDoctors` to return phone and
principal place would instead surface today's values on a document authorised months ago.

Stamping is also cheaper than expected: `approveRequest` **already reads the doctor's user doc
inside the approval transaction** (`index.ts:177`, for the doctor's name). The stamp adds **no
new read** and does not disturb the transaction's read-before-write ordering.

The field names on `users/{uid}` are confirmed as `phone` and `principalPlace`, and are already
read server-side by `authorisationPdf.ts:597-598` to render the same Clause 68C block on the
approval PDF. This change mirrors an existing precedent rather than inventing a contract.

Neither field is guaranteed present, so the stamp must tolerate absence. `phone` is required of
every user at creation (`userAdmin.ts:56`), but `principalPlace` is required only of doctors **not
on a clinic account** (`userAdmin.ts:68`) — a clinic-account doctor legitimately has none. Add
doctors created before those validations existed, and both fields can be blank in practice.

## Backend (`~/Documents/AestheticX/backend`, branch `fix/direction-prescriber-contact`)

No openspec in that repo — plain conventional-commit PR.

- **`functions/src/domain.ts`** — `AuthorisationDoc` (`:87`) gains two optional fields,
  `prescriberPhone?` and `prescriberPrincipalPlace?`. New pure helper:

  ```ts
  export function prescriberContact(doctor: Record<string, unknown>): {
    prescriberPhone?: string; prescriberPrincipalPlace?: string
  }
  ```

  Trims present string values; **omits** anything blank, whitespace-only, or non-string.

- **`functions/src/index.ts`** — one spread at the existing authorisation write site (`:187`),
  alongside `counterpartyId` / `patientName`:

  ```ts
  ...prescriberContact(doctorSnap.data() ?? {}),
  ```

**No `firestore.rules` change.** `authorisations` is already `allow write: if false`
(`firestore.rules:317`) — Function-only, so the Admin SDK writes new fields freely — and a nurse
already reads the doc via `resource.data.nurseId == uid()`.

### Why a pure helper, not a `fanOutAuthorisations` parameter

Prescriber contact is not request-derived; it comes from a **read**, like `patientName`, which
is likewise added at the set site rather than inside fan-out (`domain.ts:115`). Keeping it out
of `fanOutAuthorisations` leaves that function a clean request→docs map.

Testability decides it: `index.ts` has no unit tests, `domain.ts` is thoroughly covered. The only
logic worth testing here is the coercion of untrusted Firestore data into two strings, and the
helper puts exactly that where `domain.test.ts` can reach it. The wiring is then a one-line
spread.

### Why omit blanks rather than stamp `""`

Matches the codebase idiom for absent stamps (`...(premise ? { premise } : {})`) and lets a
reader distinguish *never stamped* from *stamped blank*, so the web fallback is automatic.

Stamping `""` would actively **regress** a doctor exporting their own direction: they would get
an empty stamped value in place of the live profile value they see today. Legacy doctors created
before `userAdmin` validation may hold blank profile fields, so this is a real case, not a
hypothetical.

## Web (branched off `fix/direction-form-autofill`)

This work **stacks on** the unmerged `direction-capture-autofill` change, which rewrites the very
`useState` initialiser being edited and declares these two fields an explicit non-goal. Building
on `main` instead would conflict in `DirectionDialog.tsx`.

- **`src/lib/demo/types.ts:166`** — `Authorisation` gains the same two optional fields.
- **`src/lib/firebase/mappers.ts:139`** — `mapAuthorisation` maps them, using the established
  conditional-spread idiom so absent stamps stay absent.
- **`src/lib/demo/direction.ts`** — new pure resolver, mirroring `premiseForCapture`:

  ```ts
  export function prescriberContactForCapture(
    authorisation: Pick<Authorisation, "prescriberPhone" | "prescriberPrincipalPlace">,
    prescriberProfile: UserProfile,
  ): { prescriberPhone: string; prescriberPrincipalPlace: string }
  ```

- **`src/components/app/DirectionDialog.tsx:33`** — the two prefill lines call the resolver, and
  the comment documenting the gap is rewritten to describe the stamp.

New openspec change `direction-prescriber-contact`, closing the non-goal that
`direction-capture-autofill` declared. That change's own non-goal text is left alone — it stays
accurate about *its* scope.

### Why the stamp wins over the profile

The same direction then reads identically whoever exports it. Preferring the profile would mean
a doctor and a nurse exporting the same authorisation produce different legal documents.

The two fields resolve **independently**: a clinic-account doctor may have a stamped phone and no
stamped principal place, and the unstamped one must still fall back rather than dragging both to
the profile.

Falling back to the profile when unstamped keeps demo working, keeps the doctor's own export
working, and leaves **pre-stamp authorisations exactly as they behave today** — which is what the
no-backfill decision requires. All fields stay editable, and `missingDirectionFields` still gates
export, so nothing incomplete escapes.

## No backfill (decided)

Stamping affects future approvals only. Authorisations live 6 months with 5 repeats, so existing
ones keep producing blank prescriber fields until they expire — the nurse types them, as today.

Backfilling was rejected because it would write **today's** profile values onto a document
authorised months ago, then present them as a record of what was true at approval — destroying
the very snapshot semantics this change exists to buy. A blank field the nurse knowingly fills is
more honest than a silently wrong one.

## Testing

TDD both sides — tests RED before implementation.

- **`domain.test.ts`** — `prescriberContact`: present values trimmed; blank, whitespace-only,
  non-string, and missing-doc cases all omit the key.
- **`mappers.test.ts`** — `mapAuthorisation` carries both stamps; absent stamps stay absent.
- **`direction.test.ts`** — `prescriberContactForCapture`: stamp wins over profile; falls back to
  profile when unstamped; both absent yields `""` so `missingDirectionFields` still reports.
- **`DirectionDialog-prefill.test.tsx`** — a nurse (no prescriber profile loaded) exporting a
  stamped authorisation sees both fields prefilled.

## Sequencing

Independently deployable in either order. Web-first simply falls back to the profile lookup until
the backend ships, because an unstamped authorisation is indistinguishable from a pre-stamp one.
Natural order is backend first. Two PRs, two repos; the web PR merges after its base.

## Out of scope

- Backfilling existing authorisations (above).
- An emulator integration test for `approveRequest` — none exists today, and standing up the
  harness costs more than this change earns. The helper is unit-tested; the wiring is one line.
- The raw-uid prescriber **name** gap, still a non-goal of `direction-capture-autofill`.
- Extending `listDoctors`, the rejected alternative.
- PDF layout, the `missingDirectionFields` gate, and persisting captured fields — all unchanged.
