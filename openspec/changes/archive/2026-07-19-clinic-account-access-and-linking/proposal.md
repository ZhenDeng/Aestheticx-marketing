# Clinic account access and clinic–doctor linking

## Why

Two bugs block clinic accounts from being usable at all (reported 19/07):

1. **Clinic login is dead on arrival.** A clinic account created via the platform admin console shows a permission-denied error on login. Root cause: live hydration issues a hard Firestore list query `appointments where ownerId == <clinicId>` for every clinic the user belongs to, but the `appointments` read rule has no clinic-membership arm (`inClinic(ownerId)`) — clinic-owned appointments are only provable via `bookedById`. Firestore rejects unprovable list queries wholesale (rules are not filters), so the entire hydrate aborts. Every clinic account carries a `clinics` claim from `createUser`'s clinic provisioning, so every clinic login fails — even with zero appointments. iOS `LiveBackend.hydrate` runs the same query, so its clinic members are equally locked out.

2. **A clinic can never be linked to a doctor.** The cooperation-relationship gate (which doctors a nurse/clinic may request authorisation from) supports clinic counterparties end-to-end — Firestore rules, the `setCooperationRelationship` callable, and the web edit/remove rows all handle `counterpartyType: 'clinic'` — but the admin console's create form is hard-coded to nurse counterparties because super-admin hydration never loads a clinic directory to pick from. Without the link, a clinic account cannot raise authorisation requests to any doctor.

## What Changes

- **Backend (AestheticX repo)**: add the missing `inClinic(resource.data.ownerId)` arm to the `appointments` read rule so clinic members can list their clinic's calendar (matching the existing `externalBusy`/`slotPublications`/`availability` clinic-member pattern), with rules tests covering allowed clinic-member reads and denied outsider reads.
- **Web hydrate (this repo)**: make the clinic-scope `appointments where ownerId == clinicId` hydrate query best-effort (`runQuerySafe`) so the web deploys safely in either order relative to the rules deploy, and a future rules regression degrades that one scope instead of killing login. The user's own-calendar query stays hard (loud on real outages).
- **Web admin console**: the create-relationship form gains a counterparty type selector (Nurse / Clinic). Selecting Clinic offers a clinic directory populated from super-admin hydration of the `clinics` collection (already super-admin readable under existing rules); demo mode seeds the Lumière clinic. Submission passes `counterpartyType: 'clinic'` through the existing store → callable path.

## Capabilities

### New Capabilities

- `cooperation-linking`: platform-admin management of doctor ↔ (nurse|clinic) cooperation relationships — specifically that a super admin can create a relationship for **either** counterparty type from the console.

### Modified Capabilities

- `account-provisioning`: strengthens "Admin-created accounts are immediately usable" with an explicit clinic-account first-login scenario — a freshly created clinic account SHALL hydrate and land on its dashboard without a permission error.

## Impact

- **Backend repo** (`~/Documents/AestheticX/backend`): `firestore.rules` (appointments read rule), `rules-tests/firestore.rules.test.js`. Requires a rules deploy; separate PR in that repo.
- **Web repo** (this repo): `src/lib/firebase/hydrate.ts`, `src/lib/demo/store.tsx` (clinics slice/selector), `src/lib/demo/types.ts` + `src/lib/firebase/mappers.ts` (clinic directory row), `src/lib/demo/seed.ts` (demo clinic), `src/components/admin/AdminConsole.tsx` (counterparty picker), plus unit tests.
- **Deploy order**: web is safe to deploy first (best-effort clinic scope); the login fix only takes effect once the backend rules deploy. iOS clinic members are fixed by the rules deploy alone (no iOS code change needed).
