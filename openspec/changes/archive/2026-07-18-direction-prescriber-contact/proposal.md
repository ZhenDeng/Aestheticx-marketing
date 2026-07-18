## Why

`direction-capture-autofill` fixed three of the five blank capture fields and declared two an
explicit non-goal: **Prescriber phone** and **Principal place of practice** could not be fixed
in this repo. A nurse exporting a Clause 68C direction got both blank, because `hydrate.ts`
loads only the caller's own `users/{uid}` doc — the nurse never holds the prescriber's profile,
and neither `listDoctors` nor the authorisation document carried the contact.

The backend now closes that: `approveRequest` stamps `prescriberPhone` and
`prescriberPrincipalPlace` onto every authorisation it writes, snapshotting the prescriber as
they were when the direction was authorised. This change consumes the stamp.

## What Changes

- `mapAuthorisation` SHALL map `prescriberPhone` and `prescriberPrincipalPlace` when present.
- The capture dialog SHALL prefill both from the stamp, falling back to the prescriber's profile
  when unstamped — which live means only when the DOCTOR exports their own direction.
- The two fields SHALL resolve independently: a stamped phone with no stamped principal place
  yields the stamped phone and the profile's principal place.
- Both remain editable, and `missingDirectionFields` still gates export **per field**, exactly as
  today — either one left unresolved blocks the export on its own.

## Capabilities

### Modified Capabilities
- `direction-capture`: prescriber phone and principal place gain a prefill source.

## Non-Goals

The prescriber **name** and its raw-uid defect are the party-names story, which owns its own
precedence chain (stamp → cooperation directory → demo accounts → `""`). The stamped clinic
premise is the clinic-premise story. Neither is touched here.

No backfill: authorisations approved before the stamp shipped keep today's behaviour.

A **clinic-account prescriber has no `principalPlace` by design** (`userAdmin.ts:68` requires it
only of doctors not on a clinic account). There is nothing to stamp for them, so Principal place
of practice stays blank and the nurse still types it. Whether it should fall back to the clinic's
address is a separate decision, not part of this change.

## Impact

- `src/lib/demo/types.ts` — `Authorisation` gains `prescriberPhone?` / `prescriberPrincipalPlace?`.
- `src/lib/firebase/mappers.ts` — `mapAuthorisation` maps both stamps, absent/blank staying absent.
- `src/lib/demo/direction.ts` — `prescriberContactForCapture` resolves stamp → profile, per field.
- `src/components/app/DirectionDialog.tsx` — prefills both fields from the resolver.
- Tests: `src/lib/firebase/__tests__/mappers.test.ts`, `src/lib/demo/__tests__/direction.test.ts`,
  `src/components/app/__tests__/DirectionDialog-prefill.test.tsx`.
- The `approveRequest` stamp itself is a backend (Cloud Functions) change, in a separate repo,
  and is already merged. No Firestore rules or PDF layout change here.
