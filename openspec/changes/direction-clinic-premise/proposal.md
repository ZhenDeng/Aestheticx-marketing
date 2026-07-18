## Why

`direction-capture-autofill` made Premises of administration follow "clinic → stamped → acting
user", and filed a caveat against itself: in live the clinic branch resolves to nothing. The
clinic's street address lives only on `clinics/{clinicId}`, and no code in this repo reads that
collection — `mapAuthRequest` builds `{id, name}` with the name set to the raw clinic id, and
`ClinicRef.address` is documented as demo-only. So every live clinic export falls through to a
blank and the clinician retypes the clinic's address onto a legal document.

The approval PDF is unaffected because a Cloud Function renders it and resolves the clinic doc
server-side. The Clause 68C direction is rendered entirely client-side, so it has no such route.

A client-side read cannot close it. `firestore.rules` makes `clinics/{id}` readable only to
clinic members, but an **independent cooperating doctor** approving a clinic nurse's request is
not one — and doctors export directions too. A lookup would render the premises for the nurse
and permission-deny the doctor, producing two different legal documents for one authorisation.

## What Changes

- `approveRequest` (Cloud Functions repo) SHALL stamp the clinic's premises — id, name and
  address from `clinics/{clinicId}` — onto every authorisation it writes, as `clinicPremise`.
  The stamp is OMITTED when there is no clinic, no clinic doc, or no usable address.
- The capture dialog SHALL resolve a clinic authorisation's Premises of administration from that
  stamp instead of from the originating request's practice context.
- `mapAuthRequest` SHALL stop passing the raw clinic id off as the clinic's name. An id is a
  non-empty string, so it would print onto the direction AND satisfy the `missingDirectionFields`
  gate — the same defect class as the raw-uid prescriber name.
- An authorisation carrying no stamp SHALL keep leaving the field blank and gated. **No backfill:**
  writing today's clinic address onto a months-old authorisation would fake the snapshot the
  stamp exists to record.

## Capabilities

### Modified Capabilities
- `direction-capture`: the clinic branch of the Premises of administration precedence now names
  the authorisation's stamped clinic premises as its source, and pins the unstamped case.

### New Capabilities
<!-- None. -->

## Impact

- `src/lib/demo/types.ts` — `Authorisation.clinicPremise?: Premise`.
- `src/lib/firebase/mappers.ts` — `mapAuthorisation` maps the stamp; `mapAuthRequest` fails the
  clinic name closed.
- `src/lib/demo/direction.ts` — `premiseForCapture` takes `clinicPremise` in place of a `ClinicRef`.
- `src/lib/demo/backend.ts` — demo `approveRequest` stamps the same field, so demo and live
  resolve by one route.
- `src/components/app/DirectionDialog.tsx` — reads the stamp.
- **Requires a Cloud Functions change** (`domain.ts` + `index.ts`), shipped as its own PR. Safe in
  either merge order: an unstamped authorisation is indistinguishable from a pre-stamp one, so
  web-first is exactly today's behaviour.
- No `firestore.rules` change — `authorisations` is already `allow write: if false` and its read
  audience already covers every exporter. No PDF layout change.
