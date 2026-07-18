# Clinic Premises on the Clause 68C Direction — Design

**Goal:** Make **Premises of administration** resolve for a clinic-context authorisation in live.
Today it is blank in every live clinic export, so `missingDirectionFields` blocks the direction
until the clinician retypes the clinic's street address by hand, every time.

Fixed by having `approveRequest` **stamp** the clinic's premises onto every authorisation it
writes, read from the `clinics/{clinicId}` doc. The web maps the stamp and `premiseForCapture`
reads it from the authorisation instead of the request.

This closes the "Live caveat" that `direction-capture-autofill`'s design.md Decision 1 filed
against itself.

## Root cause (verified both repos)

The clinic's street address never reaches the client.

- `ClinicRef.address` is optional and documented as demo-only: "live documents resolve it from
  the clinics/{id} doc server-side" (`src/lib/demo/types.ts:18-20`).
- `mapAuthRequest` builds `context: { kind: "clinic", clinic: { id: clinicId, name: clinicId } }`
  (`src/lib/firebase/mappers.ts:280`) — no address, and the **name is the raw clinic id**.
- `identitiesFromClaims` does the same for the acting identity (`src/lib/firebase/identity.ts:28`).
- `mapBusinessEntity` carries legalName/tradingName/abn — no address.
- There is **no `clinics/{id}` read anywhere in `src/`**.

Why this document specifically: the approval PDF is rendered by a Cloud Function that resolves
the clinic doc itself (`authorisationPdf.ts:580`). The 68C direction is rendered entirely
client-side (`src/lib/demo/directionPdf.ts`), so nothing resolves it there.

Current behaviour is **safe, not a regression**. `premiseForCapture` deliberately yields blank
rather than substituting the acting nurse's private premises, and the export gate prompts. The
live shape is pinned by a test: "yields blank when the clinic carries no address (the live
shape)" (`src/lib/demo/__tests__/direction-capture-prefill.test.ts:84`).

## Why stamping, not a client read

Three independent reasons, any one of which is sufficient.

**1. A client read is not permitted for every exporter.** `backend/firestore.rules:67-70`:

```
match /clinics/{clinicId} {
  allow read: if signedIn() && (inClinic(clinicId) || isSuperAdmin());
  allow write: if isSuperAdmin();
}
```

A clinic nurse is `inClinic` and could read it. An **independent cooperating doctor** approving
that clinic's request is not — and doctors export directions too (`patients/[id]/page.tsx:462`
renders the dialog for whoever holds the authorisation). A client read would fix the nurse's
export and permission-deny the doctor's, producing two different documents for one authorisation
depending on who pressed the button. On a legal record that is worse than the blank.

The stamp has no such asymmetry, because `/authorisations`' read audience is strictly **wider**
than `/clinics`' — requesting nurse, prescribing doctor, clinic members, or super admin
(`firestore.rules:312-316`) — and it is the doc the exporter has already loaded. Every party who
can export the direction can read the stamp, by construction.

**2. Snapshot semantics.** A direction should record the premises **as they were when
administration was authorised**. A render-time read shows today's address on an authorisation
approved months ago. This is the same reasoning that put `premise`, `reviewedAt`, and the Clause
68C party names on the document as stamps.

**3. The precedent already exists at the same write site.** `approveRequest` stamps
`partyNames` onto every authorisation inside its transaction (`index.ts:193`), and the approval
PDF function already does `db.doc('clinics/${request.clinicId}').get()` and feeds
`{ name, address }` into `buildApprovalDocumentModel` (`authorisationPdf.ts:580`, `:602`). This
change mirrors two existing contracts rather than inventing one.

### Why not the business entity

`businessEntities` is readable by **any signed-in user** and deliberately carries no contact PII —
its own comment says so (`src/lib/demo/types.ts:38-41`), as does the parallel `SECURITY NOTE` on
`/doctors` in the rules. For an `independentNurse` the address in question is a home address.
Putting addresses there would widen a deliberately-narrow public collection.

## The clinic NAME fix is a prerequisite, not a nicety

`mapAuthRequest` setting `name: clinicId` is currently **invisible**: `premiseDisplayLine` returns
`null` when the address is blank (`direction.ts:12-16`), so nothing renders and the id never
reaches the page.

Add an address without fixing the name and the direction immediately starts printing
`xY3kf9…, 12 Hall St Bondi Beach NSW 2026` — a raw Firebase id presented as the name of a
premises on a legal document. That is the exact defect class the Clause 68C party-name rule
exists to prevent (the original bug printed `PRESCRIBER: xY3kf9…`, and the export gate waved it
through because an id is a non-empty string).

So the two ship together, or the address fix is a regression.

## Design

### The stamp reuses the existing `Premise` shape

New optional field on the authorisation doc:

```ts
clinicPremise?: { id: string; name: string; address: string }
```

`Premise`, not a bespoke `{ name, address }` pair, for four reasons:

- `mapPremise` (`mappers.ts:132`) already exists and already **fails closed** — it returns `null`
  unless `address` is a non-empty string. The blank-address case needs no new code.
- `premiseDisplayLine` already renders `"Name, Address"` and degrades to address-only when the
  name is blank.
- It is semantically exact. `userAdmin.ts:26-27` describes `clinicAddress` as "the clinic's
  street address (its **fixed premise of administration**)".
- The web `Authorisation` type already carries a `Premise`, so the shape is familiar at both ends.

`id` is the clinic id. It is not rendered; it is there because `Premise` has one and dropping it
would need a separate type.

**Rejected: stamp the existing `premise` field for clinic requests.** Tempting — it would delete
the precedence logic entirely. It also destroys the signal that two documented decisions rest on:
`submitRequest` sets `premise: null` for a clinic request *deliberately*, meaning "use the
clinic's address", and both `premiseForCapture` and `buildApprovalDocumentModel` read it that way.
Overloading it would also drag in `submitRequest` and the approval PDF for no gain.

**Rejected: flat `clinicName` / `clinicAddress`.** Two fields to keep in step, a new mapper, and
no fail-closed behaviour for free.

### Omit, never stamp a partial

The stamp is omitted entirely when there is no `clinicId`, the clinic doc is missing, or its
address is blank / whitespace-only / not a string. Matches the codebase idiom
(`...(premise ? { premise } : {})`) and lets the reader distinguish *never stamped* from *stamped
blank*, so the fallback stays automatic and pre-stamp authorisations behave exactly as today.

**A blank clinic NAME does not suppress the stamp.** The Clause 68C field is "Premises of
administration" — an address alone satisfies it, and `premiseDisplayLine` already models this
(name optional, address required). The fail-closed rule governs **party** lines (who authorised,
who is responsible), not the location. A named premises is better; an unnamed one is still
correct.

### Backend (`~/Documents/AestheticX/backend`)

Branch off `fix/direction-party-names` — it edits the same write site. No openspec in that repo;
plain conventional-commit PR.

- **`functions/src/domain.ts`** — `AuthorisationDoc` gains `clinicPremise?`. New pure helper:

  ```ts
  export function clinicPremiseStamp(
    clinicId: string | null | undefined,
    clinicDoc: Record<string, unknown> | null,
  ): { clinicPremise?: { id: string; name: string; address: string } }
  ```

  Trims; omits the key unless `clinicId` and a non-blank string `address` are both present.

- **`functions/src/index.ts`** — one conditional read in the transaction's READ phase, beside the
  existing `doctorSnap` (`:177`), and one spread at the write site (`:193`) beside `partyNames`:

  ```ts
  const clinicSnap = request.clinicId
    ? await tx.get(db.collection('clinics').doc(request.clinicId))
    : null
  ...
  ...clinicPremiseStamp(request.clinicId, clinicSnap?.data() ?? null),
  ```

  Firestore transactions require every read before any write; this sits with the other reads, so
  the existing ordering is undisturbed. One extra read per **clinic** approval, none for
  independent ones.

**No `firestore.rules` change.** `authorisations` is already `allow write: if false`
(Function-only, so the Admin SDK writes new fields freely) and a nurse already reads the doc via
`resource.data.nurseId == uid()`.

Helper in `domain.ts` rather than inside `fanOutAuthorisations` for the same reason
`prescriberContact` and `patientName` sit outside it: this comes from a **read**, not from the
request, and fan-out stays a clean request→docs map. Testability decides it — `index.ts` has no
unit tests, `domain.test.ts` is thoroughly covered, and the only logic worth testing is the
coercion of untrusted Firestore data.

### Web

Branch off `fix/direction-form-autofill` (see Sequencing).

1. **`src/lib/demo/types.ts:183`** — `Authorisation` gains `clinicPremise?: Premise`.

2. **`src/lib/firebase/mappers.ts` `mapAuthorisation`** — map it with the established idiom, so
   an absent or blank-addressed stamp stays absent:

   ```ts
   const clinicPremise = mapPremise(data.clinicPremise);
   ...(clinicPremise ? { clinicPremise } : {}),
   ```

3. **`src/lib/firebase/mappers.ts:280` `mapAuthRequest`** — `name: clinicId` → `name: ""`, with a
   comment. After change 4 this field has no consumer, but leaving a raw id sitting in a `name`
   is a landmine for the next reader (`backend.ts:532` already reaches for
   `request.context.clinic.name` on the demo path). Verified consumers of the *request's* clinic
   name today: `DirectionDialog` only. `identityBadge` (`types.ts:591`) and `dashboard/page.tsx:172`
   read the **acting identity's** clinic, which comes from `identitiesFromClaims` — out of scope,
   see below.

4. **`src/lib/demo/direction.ts` `premiseForCapture`** — the clinic branch takes the stamp
   instead of a `ClinicRef`:

   ```ts
   export function premiseForCapture(input: {
     stamped: Premise | null | undefined;
     clinicID: string | null;
     clinicPremise: Premise | null;   // was: clinic: ClinicRef | null
     actingPremise: Premise | null;
   }): string
   ```

   Body is otherwise unchanged, and the rule Decision 1 turns on is untouched: when `clinicID` is
   set the acting user's premises are **never** consulted, so an unresolvable clinic still yields
   blank rather than a misattribution.

5. **`src/components/app/DirectionDialog.tsx:33`** — pass
   `clinicPremise: authorisation.clinicPremise ?? null`, and drop the `clinicContext` lookup. The
   `request` lookup stays; `routeForCapture` still needs it.

6. **`src/lib/demo/backend.ts:450`** — demo's `approveRequest` stamps `clinicPremise` from
   `request.context.clinic`, mirroring the Cloud Function. Without this, demo would resolve the
   premises by a *different route* than live and the resolver's clinic branch would only ever be
   exercised in live.

## No backfill (decided)

Future approvals only, matching the party-names and prescriber-contact decisions. Existing clinic
authorisations keep prompting until they expire (6 months, 5 repeats).

Backfilling would write **today's** clinic address onto a document authorised months ago and
present it as a record of what was true at approval — destroying the snapshot semantics that are
reason 2 for stamping at all. A blank field the clinician knowingly fills is more honest than a
silently wrong one.

## Risks / trade-offs

- **A clinic relocates mid-authorisation.** Repeat administrations under a 6-month authorisation
  carry the address as at approval, so the direction may not match where the patient is actually
  treated. This is the correct legal reading — the direction records what was authorised — but it
  is a real clinical situation, and the owner should confirm the expectation is "reissue the
  authorisation after a move" rather than "the document tracks the clinic". Flagged, not assumed.
- **Clinic doc missing or unreadable** → stamp omitted → blank → prompted. Identical to today.
- **Web lands before backend** → every authorisation is unstamped, which is indistinguishable
  from pre-stamp, so behaviour is exactly today's. Safe in either order.
- **One extra transaction read** on clinic approvals. The transaction already performs 1 + N
  reads; this is a conditional single-doc get in the existing read phase.
- **Changing `premiseForCapture`'s signature breaks its callers and tests** — intended and
  contained: one caller, one test file.
- **The pinning test inverts.** "yields blank when the clinic carries no address (the live shape)"
  described a gap that this change closes. It is replaced, not deleted, by a test for the *new*
  live shape plus one for the unstamped/legacy case — so the no-backfill behaviour stays pinned.

## Testing

TDD both sides — tests RED before implementation.

- **`domain.test.ts`** — `clinicPremiseStamp`: present values trimmed into `{id,name,address}`;
  omitted for no clinicId, missing doc, blank/whitespace/non-string address; **stamped with an
  empty name** when the name is blank but the address is good.
- **`mappers.test.ts`** — `mapAuthorisation` carries the stamp; absent stays absent; a
  blank-address stamp maps to absent (via `mapPremise`). `mapAuthRequest` yields `name: ""`, not
  the clinic id.
- **`direction-capture-prefill.test.ts`** — a stamped clinic authorisation renders
  `"Name, Address"`; an **unstamped** clinic authorisation still yields blank and is gated (the
  no-backfill case); the clinic branch never consults `actingPremise` (existing test, kept).
- **`DirectionDialog-prefill.test.tsx`** — a nurse exporting a stamped clinic authorisation sees
  Premises of administration prefilled, and `missingDirectionFields` no longer reports it.

## Sequencing

Both changes are independently deployable; natural order is backend first. Two repos, two PRs.

**Branch state as of 2026-07-18** (updated — `fix/direction-form-autofill` landed while this
design was being written):

| Branch | Repo | State |
|---|---|---|
| `fix/direction-form-autofill` | web | **merged** as PR #117 (`6b3f1fd`), archived as `2026-07-18-direction-capture-autofill`. `premiseForCapture` is on `main`. |
| `claude/awesome-saha-1b8eeb` | web | design only (prescriber contact); edits the same `DirectionDialog` initialiser this change touches |
| `fix/direction-party-names` | backend | unmerged, local-only — owns the authorisation write site |

So: **web branches off `main`**; **backend branches off `fix/direction-party-names`**, or off a
`main` that has merged it. The remaining overlap is `DirectionDialog.tsx`'s `useState`
initialiser, which the prescriber-contact change also edits — whichever lands second rebases over
a few adjacent lines.

An openspec change `direction-clinic-premise` should be created at implementation time, closing
the "Live caveat" that `direction-capture-autofill`'s Decision 1 filed. That change's caveat text
is left alone — it stays accurate about *its* scope.

## Out of scope

- **The acting identity's clinic name.** `identitiesFromClaims` (`identity.ts:28`) also sets
  `name: clinicId`, and unlike the request's copy this one **is rendered**: `dashboard/page.tsx:172`
  currently shows a live clinic user "Acting as nurse · `<rawClinicId>`", as does `identityBadge`
  (`types.ts:591`). Same root cause, different data path (claims, not a document), different
  surface (display, not a legal record), and a different fix — a `clinics/{id}` read on hydrate,
  which the rules **do** permit here because you are always `inClinic` your own clinic
  (`hydrate.ts:228` is the pattern to copy). Worth its own small change; mixing it in would make
  one PR half legal-document rigour and half UI polish.
- **Stamping the clinic onto `authRequests` at submission.** Would snapshot at submission rather
  than approval, giving two stamps that can disagree about one treatment. No pre-approval surface
  renders the request's clinic name today, so it buys nothing.
- **Backfilling existing authorisations** (above).
- **The raw-uid prescriber name**, prescriber phone / principal place — covered by
  `fix/direction-party-names` and the prescriber-contact design.
- PDF layout, the `missingDirectionFields` gate, and persisting captured fields — unchanged.
