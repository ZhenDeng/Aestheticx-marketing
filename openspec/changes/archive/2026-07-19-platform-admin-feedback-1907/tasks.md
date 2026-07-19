# Tasks — platform-admin-feedback-1907

## 1. Web: Products tab

- [x] 1.1 Move `ProductCatalogSection` (+ `ProductRow`, `AddProductForm`, unit options) from `AdminConsole.tsx` to `src/components/admin/ProductCatalog.tsx`; drop the section from both Admin console variants
- [x] 1.2 Add `{ href: "/app/admin/products", label: "Products" }` to `ADMIN_NAV` in `src/lib/demo/nav.ts`
- [x] 1.3 Create `src/app/app/admin/products/page.tsx` (super-admin guard + header + `ProductCatalogSection`)
- [x] 1.4 Update admin console tests that assert on the catalog section; add coverage for the Products page rendering the editor and Admin page not rendering it

## 2. Web: relationship kind

- [x] 2.1 `types.ts`: add `RelationshipKind`, optional `relationshipKind` on `CooperationRelationship`, `effectiveRelationshipKind` helper
- [x] 2.2 `backend.ts`: accept/validate kind in `SetCooperationRelationshipInput` (clinic-only), persist it, include kind in clinic audit summaries
- [x] 2.3 `identity.ts`: grant the demo employee clinic identity only when effective kind is employee
- [x] 2.4 `mappers.ts`: decode `relationshipKind` (clinic default employee, nurse none); `mirror.ts`: send it on the callable
- [x] 2.5 `AdminConsole.tsx`: Employee/Prescriber choice in the create form when counterparty type is Clinic; kind label + toggle on clinic rows; thread kind through row `patch`
- [x] 2.6 Tests: create-with-kind, legacy-default, nurse-unaffected, identity-derivation, mapper default

## 3. Backend (~/Documents/AestheticX, branch + PR)

- [x] 3.1 `cooperation.ts`: `relationshipKind` on `SetRelationshipParams` + callable validation (clinic-only, employee|prescriber, absent ⇒ employee); persist on doc; kind in audit summary
- [x] 3.2 Membership sync: grant iff active && employee; revoke branch for prescriber/inactive; remove path reads stored kind
- [x] 3.3 Integration/unit tests: employee grant, prescriber no-grant, kind flip both ways, legacy doc default, nurse+kind rejected
- [x] 3.4 Build + test green; open backend PR (note deploy-before-web)

## 4. Verify & ship

- [x] 4.1 Web: lint, typecheck, unit tests, e2e (as configured) green
- [x] 4.2 Browser-verify demo mode: Products tab, kind picker, prescriber link grants no clinic identity
- [x] 4.3 Open web PR referencing the backend PR and deploy order
