# Login Remember me + profile full-address — implementation plan

Spec: `docs/superpowers/specs/2026-07-05-login-remember-address-design.md`
Branch: `feat/login-remember-address`

## Tasks

- [x] 0. Ops (same feedback batch, no code): janetwang1115@gmail.com renamed to
      "Danny Wang" (Auth displayName + users/{uid}.name via Admin SDK, 2026-07-05).
- [x] 1. Tests first: `src/lib/demo/__tests__/login-prefs.test.ts` — stored email
      round-trip, blank → null, clear-on-not-remember, blank-not-stored, storage-throws
      swallowed (7 tests; RED then GREEN).
- [x] 2. `src/lib/demo/loginPrefs.ts` — pure, Storage injected, `ax.rememberedEmail`.
- [x] 3. `signInWithPassword(..., remember)` — `setPersistence(local|session)` before the
      credential sign-in; `signInLive` passes it through (default true = old behaviour).
- [x] 4. `LiveLogin` — default-checked "Remember me on this device" checkbox; email
      prefilled via SSR-guarded lazy initializer (loadRecentlyUsed precedent — the
      react-hooks/set-state-in-effect lint rule rejects the effect-based version);
      submit saves/clears prefs. Demo login untouched.
- [x] 5. Profile address → full-width 2-row wrapping textarea block (label above);
      other rows unchanged.
- [x] 6. Verify: 498 tests green (7 new), build + lint clean.
- [x] 7. Live QA on production infra: checkbox defaults checked; sign-in checked →
      `ax.rememberedEmail` set + firebase:authUser in localStorage; sign-out → email
      prefilled; sign-in unchecked → key cleared + firebase:authUser in sessionStorage
      only; 98-char address fully visible in the textarea (screenshot; not saved — no
      junk data written to the test doctor's profile).
- [x] 8. Engineer review — dispositions below.

## Review dispositions (2026-07-05)

Verdict: **Approve** — no CRITICAL/HIGH. Credential storage clean (email only, password
never touched; staying signed in is Firebase persistence's job), `setPersistence` ordering
correct, hydration pattern matches the repo precedent, defaults preserve old behaviour.

- **Accepted (LOW):** profile-address newlines are preserved into Firestore; no current
  consumer renders `UserProfile.address` outside the profile page, so nothing collapses
  or breaks today. If a clinician-profile PDF/print view ever lands, use
  `white-space: pre-line` there.
- **Accepted (LOW):** the remembered email isn't schema-validated before prefill — it
  only prefills an editable login field (not a security boundary).
- **Noted:** the reviewer flagged harness-injected system-reminder/hook blocks in shell
  output as a possible prompt injection; confirmed benign (standard session reminders).
