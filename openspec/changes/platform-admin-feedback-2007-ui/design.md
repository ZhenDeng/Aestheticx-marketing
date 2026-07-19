# Design — platform-admin-feedback-2007-ui

## Context

Three 20/07 testing feedback items on the platform-admin console, all web-only. Root causes: (1) `.micro { color: var(--color-ink-faint) }` ties with the Tailwind `text-card` utility (both 0,1,0) and wins by source order, so every filled `micro` chip loses its readable text colour; (2) `store.tsx` re-runs the full hydrate effect on `refreshTick` bumps and sets `status: "loading"`, and every page early-returns a bare "Loading…" on that status; (3) Business entities render as a fourth stacked section although each entity is keyed by an account-shaped owner id.

## Goals / Non-Goals

**Goals:** legible filled pills everywhere; refresh hydrates overlay rather than unmount; entity info displayed/edited on account rows; `AccountRecord.clinicIDs` for clinic-entity resolution.

**Non-Goals:** no backend changes (`setBusinessEntity` callable unchanged); no change to first-load behaviour or the demo "resets on refresh" model; no redesign of the entity form.

## Decisions

1. **CSS-level pill fix** (`.micro.text-card { color: var(--color-card) }` beside `.micro` in globals.css) rather than per-site inline styles — the same tie also affects the price Save and delete/remove Confirm buttons; one rule with 0,2,0 specificity heals all instances, current and future.
2. **`refreshing` flag in the store**, derived inside the hydrate effect: a run whose identity-set key equals the last *completed* hydrate's key is a refresh → set `refreshing` instead of `status: "loading"`; a refresh failure sets `lastSyncError` only (data stays). The overlay renders in `AppShell` over `<main>` (relative container + absolute inset overlay, spinner, `aria-busy`), so every page benefits and the per-page `status === "loading"` early returns keep handling first loads.
3. **Entity-on-account rows**: shared `AccountEntityLine` used by both console variants (live rows and the demo cast list). Owner-id resolution: `[account.id, ...account.clinicIDs]` matched against `businessEntities()`; preferred add-target is the clinic id (type `clinic`) when the account administers a clinic, else uid with type from roles. `BusinessEntityForm` gains a `fixed: {id, type}` mode (owner id hidden, type locked) for the pre-scoped add; the standalone section and its free-text owner-id add are removed — every real owner id is reachable from its account row.
4. **`clinicIDs` decode**: live `mapAccount` reads the users doc `clinics` map keys (server-managed memberships, already in the hydrated doc); demo seed derives from clinic identity contexts. Missing/garbled ⇒ `[]`.

## Risks / Trade-offs

- [Overlay blocks input during every refresh] → intended; refreshes are short and blocking prevents conflicting writes mid-hydrate.
- [An entity whose owner id matches no account (e.g. orphaned clinic) becomes invisible] → clinic entities surface via the clinic-admin account's `clinicIDs`; an entity with no matching account at all is a data error better caught by its clinic's account creation than a free-text editor. Accepted.
- [Refresh failure no longer flips `status: "error"`] → the sync-error banner (16/07 pattern) already reports categorised reasons; stale-but-rendered data beats a blank page.

## Migration Plan

Single web PR; Vercel auto-deploy. No data migration.

## Open Questions

None.
