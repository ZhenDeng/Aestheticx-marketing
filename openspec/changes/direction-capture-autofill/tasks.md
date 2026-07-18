## 1. Number & intervals default

- [x] 1.1 Update the tests that assert the old default (`direction.test.ts:223`,
  `direction-pdf.test.ts:117-119`) to expect `PRN` (RED)
- [x] 1.2 Change `DEFAULT_CAPTURED_FIELDS.administrationCountAndIntervals` to `"PRN"` in
  `src/lib/demo/direction.ts`

## 2. Premise fallback resolver

- [x] 2.1 Write `premiseForCapture` tests (RED) in `src/lib/demo/__tests__/`: stamped premise
  wins; falls back to the acting profile's selected premise; falls back through default to
  first; dangling selection does not error; blank when no premise is available anywhere
- [x] 2.2 Implement `premiseForCapture(authorisationPremise, actingProfile)` in
  `src/lib/demo/direction.ts`, reusing `activePremise` and `premiseDisplayLine`

## 3. Route fallback resolver

- [x] 3.1 Write `routeForCapture` tests (RED): recovers the route from a single matching request
  item; returns blank when the match is ambiguous; returns blank when the request is absent;
  returns blank when the matching item has no route; matching is trimmed and case-insensitive
- [x] 3.2 Implement `routeForCapture(medication, originatingRequest)` in
  `src/lib/demo/direction.ts` — match on name + dosage, use only an unambiguous single match,
  never derive the item from the authorisation id

## 4. Wire the dialog

- [x] 4.1 Write `DirectionDialog` tests (RED): premise prefills from the acting user's selection
  when unstamped; Route prefills from the originating request; Number & intervals reads `PRN`;
  every prefill stays editable and an edit reaches the built direction
- [x] 4.2 Wire `src/components/app/DirectionDialog.tsx` to the two resolvers, taking the acting
  identity from `useDemoAuth()` and the originating request from `store.state.requests`

## 5. Verification

- [x] 5.1 `npm run lint` and `tsc --noEmit` clean (no new errors)
- [x] 5.2 Full unit suite green
- [x] 5.3 Playwright suite green
- [x] 5.4 `npm run build` succeeds
- [x] 5.5 Drove the dialog in the demo as the approving doctor: Premises prefilled from the
  stamped premise, Number & intervals read `PRN`, and the built direction rendered both plus
  the route on the administration line, with export unblocked. Confirmed the gate still blocks
  correctly: BEFORE the seed fix the same authorisation showed "Still needed: Route", because
  the seeded item genuinely had no route to recover — the conservative rule behaving as
  specified, not a broken fallback.

## 6. Report the out-of-scope findings

- [x] 6.1 Report to the owner that prescriber phone + principal place need a backend change
  (stamp on the authorisation at approval, or extend `listDoctors`), with the evidence
- [x] 6.2 Report the raw-uid prescriber name defect (`direction.ts:224-234` resolves names from
  `DEMO_ACCOUNTS`) as a separate issue needing a source-of-truth decision

## 7. Follow-up found during verification

- [x] 7.1 Seeded medications had no route of administration, though the request form has
  required one per line item since round 6 — so the demo described a state the app can no
  longer produce, and the 68C export was blocked on "Still needed: Route". Fixed in seed.ts.
