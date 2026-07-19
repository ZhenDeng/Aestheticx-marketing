# Tasks — clinic account access and clinic–doctor linking

## 1. Backend: appointments rules fix (AestheticX repo, own worktree + PR)

- [x] 1.1 Add failing rules tests in `rules-tests/firestore.rules.test.js`: a clinic member (employee and admin) can list/get `appointments where ownerId == clinicId`; a non-member issuing the same list query is denied; the existing own-uid/bookedById arms stay covered.
- [x] 1.2 Add the `inClinic(resource.data.ownerId)` arm to the `appointments` read rule in `firestore.rules`; run the rules test suite green.

## 2. Web: deploy-order-safe clinic-scope hydrate

- [x] 2.1 Unit test (hydrate): clinic-scope `appointments where ownerId == clinicId` denial degrades to an empty scope instead of aborting hydrate, while an own-uid denial still throws.
- [x] 2.2 Switch the clinic-owner appointments query in `src/lib/firebase/hydrate.ts` to `runQuerySafe` (own-uid query stays hard); tests green.

## 3. Web: clinic directory in state

- [x] 3.1 Add a `ClinicDirectoryEntry` row + `clinicsByID` slice to `DemoState` (`src/lib/demo/types.ts`), a `mapClinic` mapper (`src/lib/firebase/mappers.ts`), and hydrate it for super admins via `runQuerySafe("clinics")` (`src/lib/firebase/hydrate.ts`); seed Lumière in demo (`src/lib/demo/seed.ts`). Tests for mapper + hydrate assembly + seed.
- [x] 3.2 Expose a `clinics()` selector on the store (`src/lib/demo/store.tsx`) returning the directory sorted by name with a non-blank fallback label per entry.

## 4. Web: admin console counterparty picker

- [x] 4.1 Component tests (`admin-console-actions.test.tsx` or new file): counterparty type selector renders; Clinic mode lists the seeded clinic and submits `counterpartyType: 'clinic'` with the clinic's id/name; Nurse mode unchanged; empty clinic directory shows a "no clinic accounts yet" message.
- [x] 4.2 Implement the counterparty type selector + clinic picker in `CreateRelationshipForm` (`src/components/admin/AdminConsole.tsx`), removing the "out of scope" comments; tests green.

## 5. Verification

- [x] 5.1 Full web suite (`npm test`) + build green; backend rules tests green in the backend worktree.
- [x] 5.2 Emulator/live sanity: clinic account login hydrates without a permission banner once rules are applied (emulator e2e if harness supports it, else documented manual check), and a clinic↔doctor link created in the console gates the request picker.
