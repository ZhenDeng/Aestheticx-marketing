# Tasks — platform-admin-feedback-2007-ui

## 1. Pill legibility

- [x] 1.1 Add `.micro.text-card { color: var(--color-card) }` to globals.css

## 2. Overlay refresh loading

- [x] 2.1 store.tsx: `refreshing` flag — refresh hydrates (same completed identity key) skip `status: "loading"`; refresh failure → `lastSyncError` only
- [x] 2.2 AppShell: blocking translucent overlay + spinner over `<main>` while `refreshing`
- [x] 2.3 Store/shell tests for the refresh path

## 3. Entities into accounts

- [x] 3.1 `AccountRecord.clinicIDs` (types + mapAccount + seed)
- [x] 3.2 `AccountEntityLine` (entity display + inline Edit + pre-scoped Add via `BusinessEntityForm` `fixed` mode) in live and demo account rows
- [x] 3.3 Remove `BusinessEntitiesSection`; update admin console tests; add row-entity coverage

## 4. Verify & ship

- [x] 4.1 tsc, eslint, vitest green; browser-verify pills, overlay, and entity rows in demo
- [ ] 4.2 PR, merge, deploy, archive change
