## Context

`DirectionDialog` builds its capture state once, in a `useState` initializer, from
`DEFAULT_CAPTURED_FIELDS` plus three prefills (`DirectionDialog.tsx:33-41`). Two of those
prefills already resolve correctly in demo; the gaps are missing *fallbacks*, not missing wiring.

Facts established before designing (each checked in the code, not assumed):

- `activePremise(profile)` (`backend.ts:1282`) already resolves selected → default → first, and
  tolerates a dangling selection. It is what stamps the premise on new requests, so reusing it
  keeps capture and request consistent by construction.
- `authRequests` is hydrated live with **no status filter** (`hydrate.ts:287`), so the
  originating request of an approved authorisation is present in `state.requests` — it is
  reachable. (Whether its route ever *differs* from the authorisation's is a separate question,
  and not one this repo can answer; see Decision 2.)
- A clinic-context request stamps `premise: null` deliberately (`backend.ts:403-407`) — the
  document uses the clinic's address. That null is a signal, not a gap.
- The acting user's own `users/{uid}` doc **is** hydrated (`hydrate.ts:228`) — it is only *other*
  users' profiles that are unavailable. So an acting-user-based premise fallback works live,
  while a prescriber-profile-based one cannot (see the proposal's non-goals).

## Goals / Non-Goals

**Goals:**

- Stop the dialog asking for information the app already holds.
- Never invent a clinical value on a legal document.
- Keep the new resolvers pure and unit-testable, in `direction.ts` alongside the existing ones.

**Non-Goals:**

- Prescriber phone / principal place, and the raw-uid prescriber name — both need backend or a
  source-of-truth decision. See the proposal.
- Changing the PDF layout, the `missingDirectionFields` gate, or persisting captured fields.
- Making any prefill authoritative: all stay editable.

## Decisions

### 1. Premise precedence: clinic → stamped → acting user

Clinic context wins outright, mirroring `buildApprovalDocumentModel` (`approvalPdf.ts:116-124`)
so the capture dialog and the approval document cannot disagree about where administration
happened. When `clinicID` is set the acting user's own premises are never consulted — not even
as a last resort — because a clinic request's `premise: null` means "the clinic's address", and
substituting a nurse's private practice there misattributes a legal document.

For independent authorisations the stamped premise stays first — it records where administration
was actually authorised. The fallback is then the acting user's `activePremise`, for two
reasons: it is the premise the app would
stamp on a request submitted right now, so it is the same answer by the same rule; and the
acting user's profile is the one live actually hydrates. Falling back to the *prescriber's*
premise would reintroduce exactly the unavailable-profile problem that blocks phone and
principal place.

**Live caveat, added after re-review — the same hedge Decision 2 gets.** This closes the
*misattribution* bug everywhere: a clinic authorisation can no longer print the acting nurse's
private practice, in any mode. But the *display* win is currently demo-only. Live builds its
`ClinicRef` from `mapAuthRequest` (`mappers.ts:280`) and `identitiesFromClaims`
(`identity.ts:28`), both of which populate `{id, name}` and no `address` — as `ClinicRef`'s own
JSDoc says, "live documents resolve it from the clinics/{id} doc server-side", and there is no
`clinics/{id}` read anywhere in `src`. The approval PDF is unaffected because a Cloud Function
renders it server-side, but the 68C direction PDF is rendered entirely client-side
(`directionPdf.ts`), so nothing resolves the address for it.

Net effect in live for a clinic authorisation: clinic address is empty → falls through to the
stamped premise (null, by the very rule this decision rests on) → blank, and
`missingDirectionFields` prompts the clinician to type it. That is unchanged from before this
branch — safe, not a regression — but it means "use the clinic's address" is not yet true in
live. Closing it needs a client-readable clinic address (a `clinics/{id}` read, or a richer
`mapAuthRequest`), which is filed separately. Pinned by a test asserting the live shape yields
blank, so this is a known quantity rather than a surprise.

Alternative rejected: `addressForIdentity(identity)`. It returns a bare address string for the
identity, not a `Premise`, so it loses the premise NAME that `premiseDisplayLine` renders
("Sarah Chen Aesthetics, 12 Hall St…" vs just the street). The direction should name the
premises, not only locate it.

### 2. Route recovery targets a LIVE-only divergence, and is unverifiable from this repo

**Scope caveat, added after review.** In the demo path this resolver can only ever return `""`.
`approveRequest` (`backend.ts:450-457`) sets `medication: item` from the frozen request item — the
same object — and both edit paths are status-gated to pre-approval. So whenever
`needsRouteCapture` is true (a route-less medication), the matching request item is that same
route-less object. Demo cannot produce the divergence this recovers.

It targets **live**, where the authorisation document is written by a Cloud Function in a
separate repo. The reported screenshot is the evidence: the Route capture field was rendering
(so the authorisation's medication had no route) on a request whose route the reporter says was
chosen at submission. That is exactly the divergence recovered here.

It is **not proof**. The alternative reading — that the reporter's authorisation is genuinely
legacy and its request also lacks a route — is consistent with the same screenshot, and in that
case this recovers nothing. Confirming it requires inspecting a real live authorisation document
against its `authRequests` document, which cannot be done from this repo.

The resolver is kept because it is strictly safe: it can only ever return a route the originating
request actually recorded, or `""`. But it should not be described as having closed the reported
Route gap until someone checks a live pair. Flagged for the owner rather than assumed.

### 2b. Route matching is conservative — ambiguity yields blank

The authorisation's medication is matched against the originating request's items by trimmed,
case-insensitive **name + dosage**, and the route is taken only when exactly one such item has a
route.

Rejected: deriving the item index from the authorisation id. The demo mints ids as
`${requestId}-${index}` (`backend.ts:451`), which makes indexing tempting, but the live
authorisation documents are minted by a Cloud Function whose id scheme this repo does not
control. Depending on it would work in demo and silently mis-attribute a route in live — the
worst possible failure for a document that says which route to administer by.

Where the rule cannot be certain it leaves the field blank; `missingDirectionFields` already
surfaces that as "Still needed: Route", so the clinician is prompted rather than misled. A wrong
route is far worse than an unfilled one.

### 3. `"PRN"`, not `""`

The reported instruction was to delete the invented schedule and use PRN. `PRN` ("as needed") is
a real clinical statement and the app's own existing default elsewhere
(`approvalPdf.ts` `DEFAULT_TIMING`, and the request form's `placeholder="e.g. PRN monthly"`), so
it is consistent with what the product already says, and it keeps the field non-blank so the
export gate is not tripped by a field the clinician has no specific answer for.

### 4. Resolvers take plain data; the caller resolves `activePremise`

`premiseForCapture` receives an already-resolved `actingPremise` rather than importing
`activePremise` from `backend.ts`. An earlier revision did import it, which review showed closed
a real module cycle — `approvalPdf.ts → direction.ts → backend.ts → approvalPdf.ts` — benign only
because the reference resolved at call time, and contradicting this module's own "pure" header.
Passing the value in keeps `direction.ts` free of that dependency (`madge --circular` now reports
only the two pre-existing `types.ts` cycles).

### 4b. Resolvers live in `direction.ts`, not the component

`premiseForCapture` and `routeForCapture` are pure functions taking plain data. The dialog stays
a thin caller, and the fallback rules — the part with actual judgement in them — are unit-tested
without React.

## Risks / Trade-offs

- **A prefill is wrong and gets exported unnoticed** → every prefill is a value the app already
  holds for that authorisation, all remain editable, and the ambiguous case declines to fill.
- **Route fallback silently does nothing if requests are absent** → covered by a test for the
  missing-request case; and hydration was verified to load requests unfiltered rather than
  assumed.
- **The clinic address is inert in live** → see Decision 1's caveat. The misattribution fix
  holds everywhere; the display improvement is demo-only until a client-readable clinic address
  exists. Blank-and-prompt in live, which is what it did before this branch.
- **Route recovery may be inert even in live** → see Decision 2. Safe either way (it can only
  return a recorded route or `""`), but unconfirmed; needs a check against a real live
  authorisation/request pair.
- **Premises misattributed for a clinic authorisation** → found in review. A clinic request
  stamps `premise: null` deliberately, meaning "use the clinic's address"; reading it as
  "unknown" printed the acting nurse's PRIVATE practice on a clinic patient's direction.
  Precedence now mirrors `buildApprovalDocumentModel`, and when `clinicID` is set the acting
  user's premises are never consulted — even if the clinic cannot be resolved, where it yields
  blank rather than a misattribution.
- **Trade-off: conservative route matching leaves some recoverable cases blank** (e.g. two
  identical name+dosage lines differing only by body site). Accepted deliberately: the failure
  mode of guessing is a legal document stating the wrong route of administration.
- **Changing the default breaks tests asserting the old string** — intended; those assertions
  encode the behaviour being removed, and are updated to assert `PRN`.
