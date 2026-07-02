# Clinical-notes photo/file attachments — plan

Design: `docs/superpowers/specs/2026-07-02-note-attachments-design.md`
Branch: `feat/note-attachments`

## Tasks

- [ ] 1. Model + pure backend (test-first): `NoteAttachment` type; `attachments?` on `Note` +
      both save inputs; `isImageAttachment`/`imageAttachments` helpers; seed photo note
- [ ] 2. Mappers/mirror (test-first): `mapNote` reads `attachments[]`; `encodeNote` emits
      `{fileId, displayName, mimeType}` (no dataUrl); `uploadAttachment` storage helper;
      `mirrorCreateNote` uploads pending blobs first; ticked path sends attachments in the
      consumeRepeats payload (deployed callable currently drops them — same as iOS; documented)
- [ ] 3. Composer UI: shared `NoteAttachmentsInput` (photo thumbs, renameable file chips,
      remove); wired into `TreatmentNoteForm` + the general-note form
- [ ] 4. Stream display: collapsed-row thumbnail strip; open-note inline photos (no names) +
      file chips; live download-URL resolution component
- [ ] 5. Verify: vitest + tsc + build; browser check (attach photo + PDF, rename, thumbnails
      in list + open note); engineer review loop
- [ ] 6. Docs/memory sync + PR
