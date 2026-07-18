# Prescriber Contact on the Clause 68C Direction — Design

**Goal:** Let a **nurse** export an NSW Clause 68C direction with **Prescriber phone** and
**Principal place of practice** already filled in. Today both are blank for a nurse in live, so
`missingDirectionFields` blocks the export until the nurse retypes details they may not hold.

Fixed by having `approveRequest` **stamp** the prescriber's contact onto every authorisation it
writes, read from the approving doctor's `users/{uid}` doc. The web then prefers the stamp over
its existing profile lookup.

## Depends on `fix/direction-party-names` (hard precondition)

A sibling change on branch `fix/direction-party-names` (`~/Documents/AestheticX`, uncommitted as
of 2026-07-18) already stamps the Clause 68C **party names** — `doctorName` / `nurseName` — at the
same write site, from the same `doctorSnap`, via a pure helper `directionPartyNames` in
`domain.ts`. See [[clause-68c-party-names]].

**This change extends that helper rather than adding a parallel one**, and therefore lands
*after* it. Branch off `fix/direction-party-names`, not `main`. Two helpers taking the same
`doctor: Record<string, unknown>` and spreading into the same `tx.set` would be duplication.

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

Branched off `fix/direction-party-names`. No openspec in that repo — plain conventional-commit PR.

- **`functions/src/domain.ts`** — `AuthorisationDoc` gains `prescriberPhone?: string` and
  `prescriberPrincipalPlace?: string`, alongside the `doctorName?` / `nurseName?` stamps.

  `directionPartyNames` is **extended and renamed** to `clause68CStamps`, returning everything
  `approveRequest` stamps onto an authorisation for the direction:

  ```ts
  export function clause68CStamps(
    doctor: Record<string, unknown>,
    request: { nurseName?: unknown },
  ): {
    doctorName?: string; nurseName?: string
    prescriberPhone?: string; prescriberPrincipalPlace?: string
  }
  ```

  It already carries a `usable()` coercion that trims strings and rejects non-strings; the two
  new fields reuse it unchanged.

- **`functions/src/index.ts`** — the existing `...partyNames` spread at the authorisation write
  site becomes `...stamps`, from the renamed call. No other change.

**No `firestore.rules` change.** `authorisations` is already `allow write: if false`
(`firestore.rules:317`) — Function-only, so the Admin SDK writes new fields freely — and a nurse
already reads the doc via `resource.data.nurseId == uid()`.

### Why rename rather than extend in place

Once the helper returns phone and principal place, `directionPartyNames` is inaccurate — those
are contact details, not party names. `clause68CStamps` names the responsibility precisely: *the
fields approveRequest stamps for the Clause 68C direction*. It also matches the web's existing
`CLAUSE_68C_FIELDS` naming.

The rename costs three mechanical edits (the export, the `index.ts` import and call, the
`domain.test.ts` import) and lands after `fix/direction-party-names`, so it never conflicts with
it. The `clause-68c-party-names` memory must be updated to the new name.

### Why the stamp omits blanks rather than writing `""`

Adopted verbatim from the party-names change, whose reasoning is sharper than "match the codebase
idiom": the web resolver treats **any non-empty stamp as authoritative** and stops there. A
placeholder or empty-but-present value would print onto the direction *and* satisfy the
`missingDirectionFields` gate that exists to block exactly that — a non-empty string always passes
it. Omitting lets the reader fall through to its next source and ultimately fail closed.

For contact specifically, stamping `""` would also **regress** a doctor exporting their own
direction: they would get an empty stamped value in place of the live profile value they see
today. Legacy doctors and clinic-account doctors both hold blank fields in practice, so this is a
real case, not a hypothetical.

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

New openspec change `direction-prescriber-contact`, closing the phone / principal-place half of
the non-goal that `direction-capture-autofill` declared.

### Scope: contact only, not the prescriber name

The stamped `doctorName` / `nurseName` and the raw-uid `directionPrescriberName` defect belong to
the party-names story, which owns its own web-side precedence chain (stamp → cooperation
directory → demo accounts → `""`). This change does not touch `directionPrescriberName` or
`directionResponsibleProvider`, and leaves the other half of the non-goal text standing.

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

- **`domain.test.ts`** — `clause68CStamps` stamps trimmed phone and principal place; omits each
  independently when blank, whitespace-only, non-string, or absent. The existing party-name cases
  are preserved through the rename.
- **`mappers.test.ts`** — `mapAuthorisation` carries both stamps; absent stamps stay absent.
- **`direction.test.ts`** — `prescriberContactForCapture`: stamp wins over profile; falls back to
  profile when unstamped; resolves the two fields independently; both absent yields `""` so
  `missingDirectionFields` still reports.
- **`DirectionDialog-prefill.test.tsx`** — a nurse (no prescriber profile loaded) exporting a
  stamped authorisation sees both fields prefilled.

## Sequencing

1. `fix/direction-party-names` commits and lands. **Hard gate** — nothing here starts first.
2. Backend `fix/direction-prescriber-contact`, branched off it.
3. Web, branched off `fix/direction-form-autofill`.

Backend and web are independently deployable in either order: web-first simply falls back to the
profile lookup until the backend ships, because an unstamped authorisation is indistinguishable
from a pre-stamp one.

## Out of scope

- Backfilling existing authorisations (above).
- The prescriber **name** and its raw-uid defect — the party-names story (above).
- An emulator integration test for `approveRequest` — none exists today, and standing up the
  harness costs more than this change earns. The helper is unit-tested; the wiring is one line.
- Extending `listDoctors`, the rejected alternative.
- PDF layout, the `missingDirectionFields` gate, and persisting captured fields — all unchanged.
