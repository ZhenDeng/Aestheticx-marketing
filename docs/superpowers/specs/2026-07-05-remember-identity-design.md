# Remember the selected identity across reloads — design

**Date:** 2026-07-05 · **Request:** a multi-role account (e.g. superAdmin + nurse) that
switches to nurse should stay on nurse after a page refresh, not snap back to the default
(first) role.

## Problem

`auth.tsx` resolves a live user's identities from claims and picks
`setIdentity(cur => cur ?? ids[0])` — always the first identity (the default). The user's
choice via `selectIdentity` lives only in React state, so a reload (Firebase restores the
session, `identity` starts null) re-defaults to `ids[0]`.

## Change

Device-local persistence, mirroring the `loginPrefs` / `rememberedEmail` pattern
(localStorage, Storage injected, error-swallowing) — the selection is a per-device UI
preference, never security state (the server re-derives real permissions from claims every
request regardless of which identity the UI shows).

- New pure `src/lib/demo/identityPrefs.ts`:
  - `identityKey(identity)` → `"{role}:{clinicId|independent}"` — the same stable key the
    profile switcher already uses for its list keys / `sameIdentity`.
  - `saveSelectedIdentity(storage, identity)` → writes `{uid, key}` under
    `ax.selectedIdentity` (uid-scoped so account B never inherits account A's choice).
  - `rememberedIdentityKey(storage, uid)` → the stored key iff its uid matches, else null.
  - `pickInitialIdentity(storage, uid, identities)` → the remembered identity if still in
    the resolved list, else `identities[0]` (default), else null.
- `auth.tsx`:
  - live `watchUser` restore: `setIdentity(cur => cur ?? pickInitialIdentity(localStorage,
    uid, ids))` (SSR-guarded — `window` only in the browser callback).
  - `selectIdentity` wraps `setIdentity` to also `saveSelectedIdentity`, so every explicit
    switch is remembered. `signIn` (demo initial pick) is unchanged.

No storage entry is written until the user actively switches; first-ever sign-in still
lands on the default. Sign-out does not clear the entry — re-signing the same account
restores the last choice; a different account's uid simply won't match.

## Testing

- Unit (`identity-prefs.test.ts`): `identityKey` for independent vs clinic; save→restore
  round-trip; uid mismatch → null; remembered-but-no-longer-in-list → default; empty list
  → null; storage-throws → no crash.
- Live QA: superAdmin+nurse account → switch to nurse → reload → still nurse; sign in a
  single-role account → unaffected.
