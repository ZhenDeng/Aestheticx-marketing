# Tasks — aftercare-template-texts-1907

## 1. Domain content (`src/lib/demo/aftercare.ts`)

- [x] 1.1 Update tests first (`aftercare.test.ts`): eight categories in document order,
      new display names, owner template texts (spot-check intro + a distinctive
      instruction per category), new closing sentence, per-treatment subject for a
      single selection, generic subject for zero/many, "Dear {name}," greeting, and the
      no-"automated / do not reply" guard kept.
- [x] 1.2 Implement: extend `AFTERCARE_CATEGORIES`, `aftercareDisplayName`, replace
      `aftercareTemplate` bodies with the owner's copy, update `AFTERCARE_CLOSING`,
      add `aftercareSubject`, change `aftercareEmail` greeting + subject wiring.

## 2. Form wiring (`src/components/app/AftercareForm.tsx`)

- [x] 2.1 Update `AftercareForm.test.tsx` for the new subject/greeting expectations and
      the eight chips.
- [x] 2.2 Pass the current selection into `aftercareEmail` so the subject tracks it.

## 3. Verification

- [x] 3.1 Full test suite green; lint/typecheck green.
- [x] 3.2 Confirm templates page and Firestore mappers pick up the new categories with
      no code change (or adjust if a hardcoded list surfaces).
