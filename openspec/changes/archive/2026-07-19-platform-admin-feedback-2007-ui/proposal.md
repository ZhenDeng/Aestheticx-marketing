# platform-admin-feedback-2007-ui

## Why

20/07 platform-admin testing feedback on the admin console: (1) selected Employee/Prescriber pills in Cooperation relationships render green-on-green — the `.micro` label colour ties with `text-card` on specificity and wins by source order, so the fill's readable text colour is lost; (2) every admin action triggers a full re-hydrate that replaces the whole page with a bare "Loading…" line — jarring and loses scroll/position; (3) the standalone Business entities section duplicates account-shaped information — entity details belong on the account rows themselves.

## What Changes

- **Readable filled micro pills**: a `.micro.text-card` rule restores the card text colour on any filled chip/button (kind chips, Save, Confirm — all instances repo-wide).
- **Overlay refresh loading**: the store distinguishes a *refresh* re-hydrate (same signed-in identity set, already hydrated once) from a first load. Refreshes no longer flip `status` to `loading`; they set a new `refreshing` flag, and the app shell renders a blocking translucent overlay spinner over the page content instead of unmounting it. First loads and identity switches keep the existing full-page loading state. A refresh failure surfaces through the existing sync-error banner without discarding the rendered data.
- **Business entities fold into Accounts**: the standalone Business entities section is removed from the Admin page. Each account row now shows its business entity (legal/trading name, ABN or "no ABN", inactive state) with inline Edit, and an account without one offers "Add business entity" pre-scoped to the right owner id and type (clinic-admin accounts → their clinic id/type clinic; doctors → uid/independentDoctor; nurses → uid/independentNurse). `AccountRecord` gains `clinicIDs` (decoded from the users doc `clinics` map in live; from clinic identity contexts in the demo seed) so clinic-keyed entities resolve to their account. The `setBusinessEntity` plumbing (demo reducer + callable mirror) is unchanged.

## Capabilities

### New Capabilities

- `admin-console-ux`: platform-admin console interaction behaviour — filled-pill legibility, overlay refresh loading, and entity-on-account presentation.

### Modified Capabilities

_None — the cooperation-linking and account-provisioning requirements are unchanged; this is presentation/UX plus the account-row entity surface._

## Impact

- `src/app/globals.css` (micro pill rule), `src/lib/demo/store.tsx` (`refreshing` flag), `src/components/app/AppShell.tsx` (overlay), `src/lib/demo/types.ts` + `src/lib/firebase/mappers.ts` + `src/lib/demo/seed.ts` (AccountRecord.clinicIDs), `src/components/admin/AdminConsole.tsx` (remove section, entity line in rows), admin console tests. Web-only; no backend change.
