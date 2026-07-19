## Context

"Send a consent to sign" (`src/app/app/patients/[id]/consent/remote/page.tsx`) already models the target pattern:

```ts
export function consentEmail(patientName: string, url: string): { subject: string; body: string }
export function mailtoHref(email: string, subject: string, body: string): string
```

A pure builder returns `{subject, body}`; the page renders an `<a href={mailtoHref(...)}>`. Aftercare adopts the same shape.

## Goals / Non-Goals

**Goals**
- Aftercare leaves through the practitioner's own mail client
- The clinical record still shows aftercare was issued
- The UI stops claiming delivery facts it cannot observe

**Non-Goals**
- Changing the backend. `sendAftercare`/`retryAftercare`, `mailOutbox`, and Resend all stay — iOS calls `sendAftercare` (`LiveBackend.swift:614`), and `mailOutbox` also carries appointment reminders and booking notifications.
- Changing the consent email prefill.
- Migrating historical notes that carry `deliveryStatus`/`failureReason`. They stay in Firestore and are simply ignored.

## Decisions

### The closing sentence is reworded from the literal request

Requested verbatim:

> This is an automated system email. Please do not reply directly to this message. If you have any questions, please contact your designated practitioner directly.

Shipping that under `mailto:` would be wrong on two counts. The message is composed and sent by the practitioner from their own address, so it is not automated, and a reply *does* reach them. Worse, several templates end with urgent-symptom instructions —

> **URGENT:** contact us immediately for unusual pain, white or mottled skin, or changes in vision.

— and a "do not reply" line directly beneath that could delay someone reporting a vascular occlusion. Confirmed with the owner (19/07), the shipped wording keeps the intent (route questions to the practitioner) without the false claim:

```
If you have any questions or concerns about your treatment, please contact your practitioner directly.
```

This also replaces the current closing (`"Contact us with any concerns — we're here to help."`), which says the same thing less precisely; keeping both would be redundant.

### The sentence lives in the assembler, not the templates

Appending to each of the five category templates would repeat it once per selected category. It is appended once by `assembleAftercare`, and included in the default (no-category) text, so the body always ends with exactly one copy.

### `deliveryStatus` and `failureReason` are deleted from the web, not merely hidden

Retaining the fields while never populating them invites a future reader to render them. Both come off `Note`, `mapNote`, and `encodeNote`. Consequences:

- Historical notes keep the fields in Firestore; `mapNote` ignores unknown fields, so they render as ordinary aftercare records.
- The notes-create rule's `hasOnly` allowlist includes `deliveryStatus` but **not** `failureReason`. Since the web now writes aftercare notes itself, emitting `failureReason` would have been rejected outright — removing it is required, not just tidy.
- iOS still writes `deliveryStatus` via the callable. That is unaffected; the web just stops reading it.

### The web writes the note itself

Previously the callable wrote the note server-side, so the live path deliberately skipped a local write. With the callable gone, aftercare follows the existing general-note path: apply locally, then `mirrorCreateNote`. The rule already permits `kind: 'aftercareRecord'` with `aftercareCategories` for a caller who passes `patientEditable`.

### `retryAftercare` is removed outright

It exists only to re-drive a Resend send. With no server-side send there is nothing to retry — a resend is just composing again. Removing it also retires the single-flight guard added in #122, which existed solely because a retry sent a real email.

## Risks / Trade-offs

- **No delivery signal at all.** Previously a hard bounce surfaced as "Failed". Now nothing is known, including nothing wrong. Accepted deliberately: the previous signal was only trustworthy when the pipeline was healthy, and its five-week failure was invisible in practice anyway.
- **`mailto:` depends on a configured mail client.** A practitioner on a device with no mail handler gets nothing on click. The consent flow already carries this risk and pairs the mailto with a copyable link; aftercare mitigates it by leaving the composed body visible and selectable in the panel.
- **Web and iOS now diverge.** iOS sends server-side with delivery status; web hands off. Both still append an `aftercareRecord`, so the clinical record stays consistent.

## Migration Plan

None required. No data migration, no deploy ordering — the change is web-only and the backend it stops calling stays live for iOS.
