## Why

Aftercare is the only patient email the platform sends on the practice's behalf, through Resend. That made AestheticX responsible for deliverability, and the cost was real: an unverified sender silently failed every send for five weeks (19/07, backend #105), visible only as a red "Failed" badge.

Consent forms already solve this differently and better — "Send a consent to sign" builds a prefilled `mailto:` and the practitioner sends from their own email client. The practice keeps its own sender reputation, the patient sees a familiar address, and replies land with the practitioner instead of an unmonitored mailbox. Owner feedback (19/07) is to bring aftercare onto that same pattern.

## What Changes

- Aftercare send becomes a prefilled `mailto:` opened from the practitioner's mail client, matching the consent-to-sign flow. The web no longer calls the `sendAftercare` callable.
- **BREAKING (web):** delivery tracking is removed — the Queued/Delivered/Failed badge, `failureReason`, and "Retry delivery". A `mailto:` hand-off is unobservable, so any status shown would be a guess. The clinical record (that aftercare was sent, its content and categories) is kept.
- The aftercare email body gains one closing sentence directing questions to the practitioner. Wording is adjusted from the literal request — see Design — because the requested "automated system email / do not reply" text would be false under `mailto:` and would discourage patients from reporting complications.
- The web writes the `aftercareRecord` note itself (as it already does for general notes) rather than relying on the callable to write it server-side.
- Existing prefill behaviour is unchanged: category chips, assembled templates, the editable body, the medication attachment toggle, and the empty-recipient guard.

**Not changing:** the backend `sendAftercare`/`retryAftercare` callables, `mailOutbox`, and the Resend pipeline all remain — iOS still calls `sendAftercare` (`LiveBackend.swift:614`), and `mailOutbox` also serves appointment reminders and booking notifications. This change is web-only. Removing the backend would break aftercare on iOS.

## Capabilities

### New Capabilities
- `aftercare-delivery`: how the web composes and hands off an aftercare email, and what it records on the patient file.

### Modified Capabilities
<!-- None: no existing spec covers aftercare. -->

## Impact

**Web (`Aestheticx-marketing`)**
- `src/components/app/AftercareForm.tsx` — send becomes a `mailto:` hand-off
- `src/lib/demo/aftercare.ts` — closing sentence; new pure email-prefill builder
- `src/lib/demo/store.tsx` — `sendAftercare` drops its live Resend path; `retryAftercare` removed
- `src/lib/firebase/mirror.ts` — `mirrorSendAftercare` removed; note written via `mirrorCreateNote`
- `src/lib/firebase/mappers.ts`, `src/lib/demo/types.ts` — `deliveryStatus` / `failureReason` removed
- `src/app/app/patients/[id]/page.tsx` — delivery badge, reason line, and Retry removed
- `src/lib/demo/seed.ts` — seeded failed-aftercare record no longer needs failure fields
- Tests: `aftercare-retry.test.tsx` removed; `email-delivery.test.ts` reduced to what still applies

**Reverts (web only):** the aftercare-facing parts of #122 (failureReason surfacing, live retry) land back out. Backend #104 (nurse/doctor authorization) and #105 (verified sender) stay and still protect the iOS path.

**Unaffected:** iOS, all Cloud Functions, Firestore rules. The notes-create rule already allows a client to write `kind: 'aftercareRecord'` with `aftercareCategories`; note that `failureReason` was never in its `hasOnly` allowlist, so only the Admin SDK could ever set it.
