## 1. Clinic premise stamp helper (backend)

- [x] 1.1 `AuthorisationDoc` gains `clinicPremise?: { id: string; name: string; address: string }`
  in `functions/src/domain.ts`
- [x] 1.2 Implement pure helper `clinicPremiseStamp(clinicId, clinicDoc)` in `domain.ts`: trims
  values and omits the key entirely unless `clinicId` and a non-blank string `address` are both
  present; a blank/missing name does not suppress the stamp

## 2. Wire the stamp into `approveRequest` (backend)

- [x] 2.1 Add a conditional read of `clinics/{clinicId}` inside the transaction's existing READ
  phase, beside `doctorSnap`, so Firestore's read-before-write ordering is preserved
- [x] 2.2 Spread `clinicPremiseStamp(request.clinicId, clinicSnap?.data() ?? null)` at the write
  site in `functions/src/index.ts`, beside the existing `partyNames` stamp
- [x] 2.3 No `firestore.rules` change: `authorisations` is already Function-only for writes and
  the read audience is unchanged

## 3. Type, mapping, and clinic-name fail-closed (web)

- [x] 3.1 `Authorisation` gains `clinicPremise?: Premise` in `src/lib/demo/types.ts`
- [x] 3.2 `mapAuthorisation` in `src/lib/firebase/mappers.ts` maps the stamp through the existing
  `mapPremise`, so an absent or blank-addressed stamp stays absent with no new fail-closed logic
- [x] 3.3 `mapAuthRequest` stops setting the clinic's `name` to the raw clinic id (`name: ""`
  instead), closing off the same defect class as the raw-uid prescriber name

## 4. Demo parity (web)

- [x] 4.1 Demo's `approveRequest` in `src/lib/demo/backend.ts` stamps `clinicPremise` from
  `request.context.clinic` at the same write site as the live stamp, so demo and live resolve
  Premises of administration by one route instead of two

## 5. Resolver and dialog read the stamp (web)

- [x] 5.1 `premiseForCapture` in `src/lib/demo/direction.ts` takes `clinicPremise: Premise | null`
  in place of a `ClinicRef`; the clinic branch still never consults the acting user's premises
- [x] 5.2 `DirectionDialog.tsx` passes `authorisation.clinicPremise ?? null` and drops the
  `clinicContext` lookup it replaces; the `request` lookup stays for `routeForCapture`
