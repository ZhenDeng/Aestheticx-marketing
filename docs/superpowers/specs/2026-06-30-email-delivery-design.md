# Email Delivery — Design (delivery status on aftercare records, web)

**Goal:** Surface aftercare-email delivery status on the send-record note and make failed
sends retryable — the client-facing slice of the iOS `email-delivery` spec. Demo runs the
full lifecycle; live is display-only and forward-compatible.

**Hard constraint:** `mailOutbox` is Function-only (`firestore.rules`: client read/write
denied), so the client can't read delivery status directly. iOS mirrors it onto the note
(`Note.deliveryStatus`), but the **currently deployed** `sendAftercare`/`mail.ts` Functions
do not yet wire that mirror-back or a retry-by-note. So the **live** mirror-back + retry are
**out of scope here** (they need changes in the separate `AestheticX/backend/functions`
repo) — spun off as a backend task. This increment is the web model + UI + demo lifecycle,
forward-compatible with that backend work.

**Source of truth:** `/Users/zhendeng/Documents/AestheticX/openspec/specs/email-delivery/spec.md`;
iOS `AXDomain/Notes.swift` (`DeliveryStatus` = queued | delivered | failed; `Note.deliveryStatus`,
`Note.aftercareCategories`); `backend/functions/src/mail.ts` (`retryEmail`, status lifecycle).

## Model (iOS parity)

Web `Note` gains:

```ts
deliveryStatus?: "queued" | "delivered" | "failed";   // aftercare records only
aftercareCategories?: AftercareCategory[];             // audit trail of the send
```

`mapNote`/`encodeNote` round-trip both (decode status defensively; default categories to `[]`).

## Layers

### Domain (pure, `backend.ts`)
- `recordAftercareSend` gains `categories: AftercareCategory[]`; the written `aftercareRecord`
  note carries `deliveryStatus: "queued"` and `aftercareCategories: categories`.
- `setNoteDeliveryStatus(state, patientID, noteID, status, identity)` — the patient + note must
  exist (`BackendError("notFound")`) and the caller may write the patient's notes
  (`patientPermissions(...).canWriteGeneralNote`, else `notPermitted`); set `deliveryStatus`.

### Store (`store.tsx`)
- `sendAftercare` action carries `categories` through to `recordAftercareSend` (demo) /
  the callable (live — categories aren't persisted server-side by the deployed Function; that's
  fine, the field stays demo-only until the backend is updated).
- `retryAftercare(patientID, noteID, identity)` — **demo:** `setNoteDeliveryStatus(... "delivered")`
  (a successful re-attempt); **live:** deferred (the button is demo-gated, see UI).

### Mapper / mirror
- `encodeNote` writes `deliveryStatus` (when set) + `aftercareCategories`; `mapNote` reads them.
  (No new mirror function — notes already mirror via `mirrorCreateNote`; aftercare in live is
  server-written, so the web only *reads* its status.)

### UI — patient note stream (`patients/[id]/page.tsx`)
- aftercareRecord rows show a delivery badge: **Queued** (neutral), **Delivered** (tint),
  **Failed** (rose).
- A **Retry** button on `failed` aftercare rows — rendered only in **demo** mode (live retry is
  deferred to the backend task); calls `store.retryAftercare` → the row flips to Delivered.

### Demo (`AftercareForm` + `seed.ts`)
- `AftercareForm` passes its `selected` categories into `store.sendAftercare`.
- Seed one `aftercareRecord` note with `deliveryStatus: "failed"` on a demo patient so the badge
  + Retry are demonstrable immediately.

## Data flow
- **Demo:** new aftercare → `queued`; the seeded one is `failed`; Retry → `delivered`.
- **Live:** the badge shows whatever `deliveryStatus` the note carries (absent today → no badge);
  the mirror-back that will populate it is the deferred backend task.

## Error handling
`notFound`/`notPermitted` throw `BackendError`; live failures surface via `lastSyncError`.

## Testing (TDD)
- mapper round-trip of `deliveryStatus` + `aftercareCategories` (incl. unknown-status default).
- `recordAftercareSend` sets `queued` + stores categories.
- `setNoteDeliveryStatus` (status flip, not-found, permission).
- Demo smoke: the seeded failed aftercare shows a **Failed** badge → **Retry** → **Delivered**; a
  fresh aftercare send shows **Queued**.

## Out of scope (deferred — backend task)
- The live mirror-back of `mailOutbox` status onto the note, a client-callable retry-by-note,
  the transactional provider/SPF-DKIM/secrets (all in `AestheticX/backend/functions`).
