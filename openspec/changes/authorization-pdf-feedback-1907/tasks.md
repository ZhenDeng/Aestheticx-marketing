# Tasks — authorization-pdf-feedback-1907

## 1. Web demo renderer (this repo)

- [x] 1.1 Update `src/lib/demo/__tests__/approval-pdf.test.ts` first (TDD red): new
      `DEFAULT_TIMING` wording; render test asserts the removed headings/fields are ABSENT
      ("PER ADMINISTRATION", "DIRECTION UNDER CLAUSE 68C", "Principal place of practice",
      "Period direction has effect", "Administrations" labels) and that
      "Premises of administration" + signature block remain.
- [x] 1.2 Update `src/lib/demo/approvalPdf.ts`: change `DEFAULT_TIMING`; drop
      `periodOfEffect`/`administrations` from the model; remove the Clause 68C section bar and
      the Prescriber / Principal place / Period / Administrations fields (keep Premises of
      administration); remove the PER ADMINISTRATION section. Keep the signature block.
- [x] 1.3 Web tests green (`npx vitest run src/lib/demo/__tests__/approval-pdf.test.ts` then
      the full suite); commit.

## 2. Backend renderer (Aestheticx repo, coupled PR)

- [x] 2.1 Create a feature branch in /Users/zhendeng/Documents/Aestheticx; update
      `backend/functions/src/authorisationPdf.test.ts` first (TDD red): new `DEFAULT_TIMING`;
      model drops `periodOfEffect`/`administrations`/`recordingRowCount`; `headerContactLines`
      excludes the prescriber phone; render assertions for absent headings/fields.
- [x] 2.2 Update `backend/functions/src/authorisationPdf.ts`: same removals; header contact
      lines keep clinic phone/email only; delete the recording-grid drawing +
      `MAX_RECORDING_ROWS`; keep notices, emergency references, signature block.
- [x] 2.3 Backend tests + build green (`npm test` / `tsc`) in backend/functions; commit.

## 3. Review, verify, ship

- [x] 3.1 Engineer review (code-reviewer) on both diffs; fix CRITICAL/HIGH; re-run tests.
- [x] 3.2 Full web suite + lint/build green; full backend suite green.
- [x] 3.3 Sync delta spec into main specs (`openspec-sync-specs`).
- [ ] 3.4 Open both PRs (web `/create-pr`; backend PR referencing the web PR; note the
      Functions deploy requirement in the backend PR body).
