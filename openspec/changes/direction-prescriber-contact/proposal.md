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
