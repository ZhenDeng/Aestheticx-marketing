## 1. Compose the aftercare email (pure)

- [x] 1.1 Add `AFTERCARE_CLOSING` + `AFTERCARE_DEFAULT_BODY` and a new `aftercareBody(categories)` that appends the closing once, in `src/lib/demo/aftercare.ts`. (Kept `assembleAftercare` pure — it mirrors iOS `AftercareComposer.assemble`, so the closing belongs in the body composer above it, not inside it.)
- [x] 1.2 Add `aftercareEmail(patientName, body): { subject, body }` in `src/lib/demo/aftercare.ts`, mirroring `consentEmail`
- [x] 1.3 Tests: closing sentence appears exactly once for one category, for several categories, and in the default text; `aftercareEmail` greets by name and falls back when the name is blank

## 2. Hand off through mailto

- [x] 2.1 `AftercareForm` builds the prefill and opens `mailtoHref(recipient, subject, body)` instead of calling `store.sendAftercare`'s Resend path
- [x] 2.2 Keep the existing empty-recipient guard, category chips, editable body, and medication toggle
- [x] 2.3 Still record the send (note append) when the practitioner confirms
- [x] 2.4 Tests: confirming opens a mailto to the patient carrying the composed body; a patient with no email keeps the control disabled; the note is still recorded

## 3. Write the note from the client

- [x] 3.1 `store.sendAftercare` records locally in both modes and mirrors via `mirrorCreateNote` in live; drop the `mirrorSendAftercare` call
- [x] 3.2 Remove `mirrorSendAftercare` from `src/lib/firebase/mirror.ts`
- [x] 3.3 Verify the encoded note carries only keys the Firestore `hasOnly` allowlist permits

## 4. Remove delivery tracking

- [x] 4.1 Remove `retryAftercare` from the store and `StoreValue`; remove `mirrorRetryAftercare`
- [x] 4.2 Remove the delivery badge, failure-reason line, and Retry control from `src/app/app/patients/[id]/page.tsx`
- [x] 4.3 Remove `deliveryStatus` and `failureReason` from `Note`, `mapNote`, and `encodeNote`
- [x] 4.4 Remove `DeliveryStatus` from `src/lib/demo/types.ts` and `setNoteDeliveryStatus` from `src/lib/demo/backend.ts` if unused
- [x] 4.5 Update the seed's aftercare record to drop the failure fields
- [x] 4.6 Deleted `aftercare-retry.test.tsx` and `email-delivery.test.ts` (its subject, the Resend status pipeline, is gone); the assertions that still apply moved to a new `aftercare-record.test.ts`
- [x] 4.7 Test: a note carrying a legacy `deliveryStatus` from Firestore renders with no badge

## 5. Verify

- [x] 5.1 Full suite green, `tsc --noEmit` clean, lint clean on changed files
- [x] 5.2 Drove the demo: mailto to amara@example.com carries the subject, `Hi Amara Boyd,`, both category sections in selection order, the closing sentence exactly once even with 2 categories, and the filler template's URGENT line intact; hand-off appended the note (1 -> 2) with no badge and no Retry anywhere. (Required `npm ci` in the worktree — Turbopack won't resolve a parent or symlinked node_modules.)
- [x] 5.3 Confirm no remaining reference to `sendAftercare`/`retryAftercare` callables in the web, and that the backend is untouched

## 6. Review fixes (engineer review, 19/07)

- [x] 6.1 Don't unmount the panel inside the anchor's own click handler — detaching the element before the browser follows the mailto can silently drop it (the reference consent anchor has no onClick at all)
- [x] 6.2 Keep the panel open after hand-off with a confirmation, so the composed text stays selectable if no mail client opened, and the hand-off stays re-clickable while recording only once
- [x] 6.3 Warn when the mailto exceeds ~2k characters (all five templates reach ~2.6k), which some desktop handlers truncate — otherwise a short send would fail invisibly
- [x] 6.4 Restore the defensive `!canSend` guard inside the handler that the 15/07 fix had deliberately added
