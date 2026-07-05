# Remember the selected identity across reloads — implementation plan

Spec: `docs/superpowers/specs/2026-07-05-remember-identity-design.md`
Branch: `feat/remember-identity`

## Tasks

- [x] 1. Tests first (`identity-prefs.test.ts`): `identityKey` (independent/clinic),
      save→restore round-trip, uid scoping, remembered-but-absent → default, empty → null,
      storage-throws swallowed (10 tests; RED then GREEN).
- [x] 2. `src/lib/demo/identityPrefs.ts` — pure helpers, Storage injected, uid-scoped key.
- [x] 3. `auth.tsx`: live `watchUser` restore via `pickInitialIdentity(localStorage, uid,
      ids)`; `selectIdentity` also `saveSelectedIdentity`. `signIn` (demo) unchanged.
- [x] 4. Verify: 513 tests green (10 new), build + lint clean.
- [x] 5. Live QA on production infra (multi-role account superAdmin+doctor+nurse):
      default = superAdmin → switch to Nurse (localStorage `{uid,key:"nurse:independent"}`)
      → reload → **stays nurse**; switch back to Platform → reload → **stays superAdmin**
      (key updated). Selection genuinely persists both directions.
- [x] 6. Engineer review — dispositions below.

## Review dispositions (2026-07-05)

Verdict: **Approve** — no CRITICAL/HIGH/MEDIUM. Reviewer independently confirmed: uid
scoping prevents cross-account leakage (a stale/tampered key can at worst fall back to
the default — never selects an identity not already in the claims-derived list), the
restore path is client-only (runs inside watchUser), the security framing is accurate
(device-local UI preference, server re-derives permissions from claims), and no
memo/stale-closure issue from `selectIdentity` becoming an inline arrow.

- **Accepted (LOW):** the `JSON.parse(...) as {...}` cast in `rememberedIdentityKey` is
  an unchecked assertion, but both fields are immediately narrowed (`uid ===` /
  `typeof key === "string"`) so a primitive/garbage value falls through to null without
  throwing. Matches the `loginPrefs` precedent; left as-is.
