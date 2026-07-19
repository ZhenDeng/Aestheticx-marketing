## Context

`DirectionDialog` captures the Clause 68C fields that cannot be derived from the authorisation,
previews the direction, and exports a PDF. `missingDirectionFields` (`src/lib/demo/direction.ts`)
is the single gate: while it returns anything, both Preview and Download are withheld and the
names are printed in one red line at the foot of the form.

That gate is doing exactly the right thing. The reported problem is that the form communicates
its state badly, and that one of its inputs is under-constrained:

- The three blanks a nurse sees on a legacy authorisation (`Prescriber phone`, `Principal place of
  practice`, `Route`) are unresolvable **by construction** — `hydrate` reads only the caller's own
  `users` doc, so `profileForUser(doctorID)` is the blank default for anyone but the doctor; the
  authorisation predates the prescriber-contact stamp; and both the medication and the originating
  request's items predate per-item routes. Nothing client-side can recover them.
- `Route` is captured with the same free-text `Field` as everything else, so a clinician can type
  anything at all into a value that prints on a legal document — while the request form, for the
  same value, offers exactly five options.

The entry point has a parallel legibility problem: the control is labelled `68C`.

## Goals / Non-Goals

**Goals:**

- Make each unresolved field legible at the field, so the clinician knows precisely what to fill.
- Explain once that the values could not be resolved from the record — a blank should read as a
  prompt, not as a bug.
- Constrain `Route` to the five legal routes of administration.
- Name the entry-point control for the document it produces.

**Non-Goals:**

- Changing what counts as missing, or when export unlocks. `missingDirectionFields` is untouched.
- Making prescriber phone / principal place resolvable for legacy authorisations. That needs the
  backend repo (a backfill, or prescriber contact on the cooperation relationship doc) and is a
  separate change.
- Any wire-format, Firestore-rules, or PDF-layout change. A fully-populated direction must export
  byte-identically — `direction-pdf-ops.test.ts` pins that hash.
- Backfilling or migrating existing data of any kind.

## Decisions

### Drive inline marking from `missingDirectionFields`, not from a parallel check

The dialog already computes `missing` for the summary. Each capture field maps to the canonical
label it would appear under (`"Prescriber phone"`, `"Principal place of practice"`, `"Route"`, …),
and a field renders as required-and-invalid exactly when its label is in `missing`.

*Alternative rejected:* per-field `value.trim() === ""` checks. That reintroduces the same emptiness
rule in a second place, so the inline state and the export gate could drift apart — precisely the
class of bug this dialog cannot afford. One source of truth keeps them provably consistent.

### `Route` becomes a shared selector, lifted out of the request form

`RouteSelect` currently lives inside `src/app/app/patients/[id]/request/page.tsx`. Lift it to a
shared component so the request form and the capture dialog use one control, one option list, one
set of labels, and one "never pre-chosen" rule.

*Alternative rejected:* duplicating a `<select>` in the dialog. Two option lists over a legal
enumeration will diverge; the request form's rule that route is an active choice would have to be
restated and could be restated wrongly.

Note the asymmetry: the capture dialog's `route` is a *legacy fallback* only — it renders solely
when `authorisation.medication.route` is absent (`needsRouteCapture`). Modern authorisations never
show it. Sharing the control does not make the dialog a second place where routes are chosen for
new work.

### Accessibility over colour

The current signal is colour alone (`--color-danger` text). Inline marking uses `aria-invalid` and
`aria-describedby` on the control plus a visible textual required affordance on the label, so the
state survives greyscale, and a screen reader reaches the field already knowing it needs a value.
Colour remains, as reinforcement rather than as the carrier. This follows the a11y token work
already done in this repo (WCAG AA contrast on the theme tokens).

### The clause number moves to supplementary, not away

`Direction` becomes the visible label; `title="Clause 68C direction"` carries the citation on
hover; `aria-label` and the dialog heading are unchanged. The regulation reference is never
removed from the surface — only demoted from being the sole label.

## Risks / Trade-offs

- **[The shared `RouteSelect` changes the request form's markup]** → Lift it verbatim; the request
  form's existing tests must pass unmodified. If any of them assert on markup the lift would
  change, keep the request form's wrapper and share only the option list plus the inner control.
- **[`aria-invalid` on first open may read as an error the clinician caused]** → Pair it with the
  one-line explanation, and word that line as "couldn't be resolved from the record", not as a
  validation failure. The field is being asked for, not rejected.
- **[Selector cannot represent a legacy free-text route already typed]** → Nothing persists captured
  fields (the direction is assembled on demand and never stored), so there is no stored free-text
  route to migrate. Any route in play came from the enumeration to begin with.
- **[Regression risk to the pinned PDF bytes]** → No change touches `directionPdf.ts` or the
  `DirectionContent` shape. `direction-pdf-ops.test.ts` runs as the guard.

## Migration Plan

None required — no persisted data, wire format, or stored artifact changes. The change is
deployable as an ordinary web release and revertible by rollback alone.

## Open Questions

None. The one genuine fork — whether to pursue the backend backfill that would make prescriber
contact resolvable for legacy authorisations — was settled as out of scope for this change and
recorded as a follow-up in the proposal.
