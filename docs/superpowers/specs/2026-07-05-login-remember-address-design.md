# Login "Remember me" + profile full-address display — design

**Date:** 2026-07-05 · **Request:** owner feedback — (1) add a Remember me function to the
login page; (2) on the profile page, find a way to show the whole address.

## 1. Remember me (live login only)

Firebase web sessions already persist by default (`browserLocalPersistence`), so today
every login is silently "remembered". The checkbox makes that a real choice and adds
email prefill:

- **Checked (default — preserves current behaviour):** local persistence (stays signed in
  across browser restarts) and the email is saved for prefill on the next visit.
- **Unchecked:** `browserSessionPersistence` (signed out when the browser closes) and any
  stored email is cleared.

Pieces:
- Pure `src/lib/demo/loginPrefs.ts` (unit-tested, Storage injected): key
  `ax.rememberedEmail` (precedent: `ax.recentlyUsedProducts` — device-local, like iOS
  UserDefaults). `rememberedEmail(storage): string | null`; `saveLoginPrefs(storage,
  {email, remember})` — writes when remembering, removes when not; both swallow storage
  errors (private browsing).
- `signInWithPassword(email, password, remember)` (`firebase/auth.ts`): `setPersistence`
  local/session **before** `signInWithEmailAndPassword`; `signInLive` (auth.tsx) passes it
  through.
- `LiveLogin` (LoginForm.tsx): checkbox; on mount prefills email from the stored value
  (and reflects it in the checkbox); on submit saves/clears via `saveLoginPrefs`.
- Demo login unchanged (no credentials to remember).

Only the email is ever stored — never the password.

## 2. Whole address on the profile page

`ProfileFieldsEditor` renders Address as a narrow right-aligned single-line input
(`w-56 max-w-[60%]`), so anything longer than ~25 characters is visually cut. Address
becomes its own block row: label on top, full-width left-aligned auto-wrapping
`textarea` (2 rows, resize-none, same field styling). AHPRA/phone/ABN rows unchanged;
save/dirty behaviour unchanged (newlines are not introduced by the field itself —
Enter submits nothing, it just wraps).

## Testing

- Unit: `loginPrefs` (remember stores email; not-remember clears; missing/blank → null;
  storage that throws → no crash, null).
- Manual live QA: sign in with Remember me checked → reload → email prefilled; sign in
  unchecked → stored email cleared; long address fully visible and editable on profile.

## Ops note (same feedback batch, no code)

janetwang1115@gmail.com renamed "Janet Wang" → "Danny Wang" (Auth displayName +
users/{uid}.name, 2026-07-05) via Admin SDK; visible on next sign-in/hydrate.
