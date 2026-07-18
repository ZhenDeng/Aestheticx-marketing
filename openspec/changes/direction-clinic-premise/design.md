## Context

`direction-capture-autofill` (archived as `2026-07-18-direction-capture-autofill`) wired the
Clause 68C capture dialog's Premises of administration field to a "clinic → stamped → acting
user" precedence, but its own design.md filed a caveat against the clinic branch: in live it
resolves to nothing, because the clinic's street address never reaches the client. This change
closes that caveat. It does not amend the archived change — its "Live caveat" stays accurate
about the scope it shipped.

Full investigation, evidence, and rejected alternatives:
`docs/superpowers/specs/2026-07-18-direction-clinic-premise-design.md`.

## Decision 1 — Stamp the clinic's premises at approval, do not read `clinics/{id}` from the client

`approveRequest` now reads `clinics/{clinicId}` inside its existing transaction and writes
`clinicPremise: {id, name, address}` onto the authorisation it creates. The capture dialog reads
that stamp; it never queries the clinic collection itself.

A client-side read was the more obvious fix and was rejected for two independent reasons:

- **The read isn't permitted for every exporter.** `firestore.rules` scopes `clinics/{id}` to
  `inClinic(clinicId) || isSuperAdmin()`. A clinic nurse satisfies that. An **independent
  cooperating doctor** approving that same clinic's request does not — and doctors export
  directions too. A client read would render the premises correctly for the nurse and
  permission-deny the doctor, so the same authorisation would produce two different legal
  documents depending on who clicked export. `authorisations` itself has no such asymmetry: its
  read audience (requesting nurse, prescribing doctor, clinic members, super admin) already
  covers everyone who can open the dialog, so the stamp is readable by construction wherever the
  dialog runs.
- **A legal document should record a snapshot, not a live value.** The direction states the
  premises of administration *as authorised*. A render-time lookup would show today's address on
  an authorisation approved months ago, silently drifting if the clinic moves. Stamping at
  approval is the same reasoning already applied to `premise`, `reviewedAt`, and the Clause 68C
  party names on this document, and it mirrors the approval PDF, which already resolves the
  clinic doc server-side at generation time.

## Decision 2 — The stamp is a `Premise`, not a new shape, and it is a new field

`clinicPremise?: { id: string; name: string; address: string }` reuses the existing `Premise`
type rather than introducing a bespoke `{name, address}` pair. That buys the fail-closed
behaviour for free: `mapPremise` already treats a missing or blank `address` as absent, so an
incompletely-stamped value maps to `undefined` with no new mapping code, and
`premiseDisplayLine`'s existing name-optional/address-required rendering applies unchanged.

It is a **new** field (`clinicPremise`), not a reuse of the authorisation's existing `premise`
field. `submitRequest` deliberately sets `premise: null` on a clinic request to mean "use the
clinic's address," and both `premiseForCapture` and the approval PDF model already read that
`null` as a signal. Writing the clinic's address into `premise` would erase that signal — a
clinic authorisation would then look indistinguishable from one where a premise was actually
stamped for another reason — and would drag `submitRequest` and the approval PDF into this change
for no benefit. Keeping the two fields separate keeps "no premise stamped, defer to the clinic"
and "here is the clinic's stamped premises" distinguishable.

## Decision 3 — No backfill

Only authorisations approved after this ships carry the stamp. Existing clinic authorisations
keep resolving to blank and keep prompting the clinician, until they expire under the existing
6-month / 5-repeat rule.

Backfilling — writing each clinic's current address onto its past authorisations — was
considered and rejected: it would present today's address as though it were the address in force
at the time of approval, which is exactly the false snapshot Decision 1 stamps to avoid. A blank
field the clinician knowingly fills in is more honest than one silently populated with a value
that may not have been true when the authorisation was granted. This matches the no-backfill
precedent already set for `partyNames` and prescriber contact.
