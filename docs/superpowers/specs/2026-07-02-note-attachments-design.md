# Clinical-notes photo/file attachments — design

**Date:** 2026-07-02 · **Spec source:** `~/Documents/AestheticX/openspec/specs/clinical-notes/spec.md`
(requirements: *Photo and file attachments* — both note kinds accept photo + file attachments;
photos render as inline thumbnails with no file names; non-photo files show a renameable display
name, rename touching only the stored name, never the Storage object — and *Photo previews in
the note list* — a note with photos shows a thumbnail strip beneath its list-row title without
being opened.)

## Wire + platform facts (verified against source)

- iOS domain: `Attachment {fileID, displayName, mimeType}`; `isImage = mimeType.startsWith("image/")`;
  encoded on the note doc as `attachments: [{fileId, displayName, mimeType}]`
  (`AXData/LiveBackend.swift` encode/decode). The backend's `mergeStorage.ts` already re-points
  `attachments[].fileId` on patient merge — the field is live-supported today.
- Object keys: `patients/{patientId}/photos/{uuid}` and `patients/{patientId}/files/{uuid}`
  (per iOS upload convention + `mergeStorage.test.ts`).
- Storage rules: authenticated, patient-visible clients may **upload directly** to
  `patients/{id}/**` (not `forms/`) — `image/(jpeg|png|webp|heic)` or `application/pdf`,
  < 25 MB — and read with the same visibility check. No new backend work needed.
- Rename exists **only at composition time** in iOS (`Attachment.renamed(to:)` has no
  post-save persistence API; notes are immutable once saved). The web mirrors that: rename
  lives in the composer, before save.

## Model

```ts
// types.ts
export interface NoteAttachment {
  fileID: string;      // Storage object key — never changes after upload
  displayName: string; // what the user sees; renaming touches only this
  mimeType: string;
  dataUrl?: string;    // DEMO-ONLY inline preview bytes; never encoded to Firestore
}
export interface Note { …; attachments?: NoteAttachment[] } // optional: legacy notes/tests untouched
```

`isImageAttachment(a)` = `mimeType.startsWith("image/")`; `imageAttachments(n)` filters.
Demo mode has no Storage, so a demo attachment carries its preview as a `dataUrl` (state is
in-memory and resets on reload — size is acceptable); live attachments resolve their preview
via `fileDownloadUrl(fileID)` (existing `storage.ts` helper, rules-permitted).

## Save path

- `SaveGeneralNoteInput` / `SaveTreatmentNoteInput` gain `attachments?: NoteAttachment[]`,
  stamped onto the note (pure backend).
- The composer builds attachments: minted `fileID` (`patients/{id}/photos/{noteless-uuid}.{ext}`
  or `…/files/…`), `displayName` = original file name (renameable inline for non-photos),
  `dataUrl` via FileReader, and keeps the `Blob` in component state keyed by `fileID`.
- Live mirror: before the note-doc write, upload each blob with
  `uploadAttachment(fileID, blob, mimeType)` (new `storage.ts` helper — `uploadBytes`, same
  pattern as `uploadSignature`); then `mirrorSaveNote` with `encodeNote` emitting
  `attachments: [{fileId, displayName, mimeType}]` (no `dataUrl`). Upload failures land in the
  existing `lastSyncError` banner path like any mirror failure.
- `mapNote` reads `attachments[]` back (string fields only).

## UI

- **Composer (shared `NoteAttachmentsInput`)**: "Attach photo or file" input
  (`accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"`, multiple). Photos
  render as small square thumbnails with a remove ×; non-photos render as a chip with an
  editable display-name input + remove. Used by `TreatmentNoteForm` and the patient page's
  general-note form.
- **Note stream** (`patients/[id]/page.tsx`): collapsed rows with photos show a thumbnail strip
  (~40px squares) beneath the title line (spec: visible without opening). Open notes show
  photos as larger inline thumbnails (no file names) and non-photo attachments as displayName
  chips; in live mode a chip/thumbnail resolves its URL on demand (component-level
  `useEffect` + `fileDownloadUrl`), demo uses `dataUrl` directly.
- Seed: one general note on a seed patient with two small photo attachments (tiny inline PNG
  data-urls) so the thumbnail strip is demonstrable.

## Out of scope

Post-save attachment editing (no such iOS capability), Storage deletion/GC, HEIC client-side
conversion, aftercare-record attachments (iOS sends aftercare with `attachments: []`),
attachment support in the deployed `consumeRepeats` path beyond what the note doc carries
(the callable writes the note doc from its payload — verify field passthrough during build;
if the deployed callable drops `attachments` on ticked treatment notes, ship untucked-note +
general-note attachments now and note the callable gap for a backend increment).

## Tests

- Backend: general + treatment note saves stamp attachments; `imageAttachments` filter.
- Mappers: `encodeNote` emits `{fileId, displayName, mimeType}` (never `dataUrl`, empty array
  when absent); `mapNote` round-trips and ignores junk.
