# Clinical-notes photo/file attachments — plan

Design: `docs/superpowers/specs/2026-07-02-note-attachments-design.md`
Branch: `feat/note-attachments`

## Tasks

- [x] 1. Model + pure backend (test-first): `NoteAttachment` type; `attachments?` on `Note` +
      both save inputs; `isImageAttachment`/`imageAttachments` helpers; seed photo note
- [x] 2. Mappers/mirror (test-first): `mapNote` reads `attachments[]`; `encodeNote` emits
      `{fileId, displayName, mimeType}` (no dataUrl); `uploadAttachment` storage helper;
      `mirrorCreateNote` uploads pending blobs first; ticked path sends attachments in the
      consumeRepeats payload (deployed callable currently drops them — same as iOS; documented)
- [x] 3. Composer UI: shared `NoteAttachmentsInput` (photo thumbs, renameable file chips,
      remove); wired into `TreatmentNoteForm` + the general-note form
- [x] 4. Stream display: collapsed-row thumbnail strip; open-note inline photos (no names) +
      file chips; live download-URL resolution component
- [x] 5. Verify: vitest (328) + tsc + `next build` green; browser-checked (seed strip renders
      collapsed, open note shows no-name photos + PDF chip; attached a PNG+PDF to a general
      note, renamed the PDF in the composer, saved — strip + renamed chip persisted, raw photo
      file names never shown); engineer review loop: Warning → two actionable findings fixed
      in c333d15 (HIGH: add() merged into a stale render-scope snapshot after slow FileReader
      awaits — composer now takes a setState-style updater, functional updates throughout,
      race browser-verified fixed; A11y: list-row thumb strip inside the toggle button now
      aria-hidden with empty alts) → re-review **Approve**, no new findings. MEDIUM/LOW items
      (silent useAttachmentUrl catch, mapAttachments empty-string tolerance, sequential
      uploads, demo dataUrl memory) accepted as documented trade-offs
- [x] 6. Docs/memory sync + PR — https://github.com/ZhenDeng/Aestheticx-marketing/pull/43
