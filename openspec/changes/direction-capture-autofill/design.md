## Context

`DirectionDialog` builds its capture state once, in a `useState` initializer, from
`DEFAULT_CAPTURED_FIELDS` plus three prefills (`DirectionDialog.tsx:33-41`). Two of those
prefills already resolve correctly in demo; the gaps are missing *fallbacks*, not missing wiring.

Facts established before designing (each checked in the code, not assumed):

- `activePremise(profile)` (`backend.ts:1282`) already resolves selected → default → first, and
  tolerates a dangling selection. It is what stamps the premise on new requests, so reusing it
  keeps capture and request consistent by construction.
- `authRequests` is hydrated live with **no status filter** (`hydrate.ts:287`), so the
  originating request of an approved authorisation is present in `state.requests`. A route
  fallback that reads it is not dead code in live.
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

### 1. Premise fallback uses the ACTING user, not the prescriber

The stamped premise stays first — it records where administration was actually authorised. The
fallback is the acting user's `activePremise`, for two reasons: it is the premise the app would
stamp on a request submitted right now, so it is the same answer by the same rule; and the
acting user's profile is the one live actually hydrates. Falling back to the *prescriber's*
premise would reintroduce exactly the unavailable-profile problem that blocks phone and
principal place.

Alternative rejected: `addressForIdentity(identity)`. It returns a bare address string for the
identity, not a `Premise`, so it loses the premise NAME that `premiseDisplayLine` renders
("Sarah Chen Aesthetics, 12 Hall St…" vs just the street). The direction should name the
premises, not only locate it.

### 2. Route matching is conservative — ambiguity yields blank

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

### 4. Resolvers live in `direction.ts`, not the component

`premiseForCapture` and `routeForCapture` are pure functions taking plain data. The dialog stays
a thin caller, and the fallback rules — the part with actual judgement in them — are unit-tested
without React.

## Risks / Trade-offs

- **A prefill is wrong and gets exported unnoticed** → every prefill is a value the app already
  holds for that authorisation, all remain editable, and the ambiguous case declines to fill.
- **Route fallback silently does nothing if requests are absent** → covered by a test for the
  missing-request case; and hydration was verified to load requests unfiltered rather than
  assumed.
- **Trade-off: conservative route matching leaves some recoverable cases blank** (e.g. two
  identical name+dosage lines differing only by body site). Accepted deliberately: the failure
  mode of guessing is a legal document stating the wrong route of administration.
- **Changing the default breaks tests asserting the old string** — intended; those assertions
  encode the behaviour being removed, and are updated to assert `PRN`.
