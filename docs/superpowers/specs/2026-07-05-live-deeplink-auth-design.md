# Live-mode deep links survive reload (auth-restore gate) — design

**Date:** 2026-07-05 · **Reported as:** "consent function is missing."

## Problem (what the report actually was)

Gap analysis + live E2E verification (2026-07-05, signed in as a real doctor on production
infra) show the consent capability is **fully present and working** — all 7 templates
verbatim, on-device signing (screening questions, full legal text incl. the off-label
clause, drawn signature), the signed record on the patient file, the server-rendered PDF
(`finalizeSignedForm` → Download PDF), the remote channel (`createFormLink` → token URL on
the deployed signing host + QR + email), and delete-in-error. Gating is exact iOS parity
(`PatientPermissions.swift`): **super admin is read-only** — no "Sign a consent"/"Send a
link" buttons — and a prescriber-only doctor cannot send forms. Someone browsing live as
the super admin would reasonably conclude consent is missing.

The verification did surface a real defect that compounds the confusion:

**In live mode, every full page load of an `/app/...` URL bounces to the dashboard.**
On first render Firebase is still restoring the persisted session, so `identity` is null;
`AuthGuard`'s effect immediately `router.replace("/login")`; when the session then resolves,
`LiveLogin` forwards to the hardcoded `/app/dashboard`. The originally requested URL is
lost. Consequences: pasting/bookmarking a patient or form URL never works, and reloading
mid-flow (e.g. on a consent page) dumps the user on the dashboard.

## Change

- `auth.tsx`: expose `resolved: boolean` — demo mode `true` immediately; live mode `false`
  until the **first** `watchUser` callback (signed in or not), then `true` forever.
- New pure `src/lib/demo/authRedirect.ts`:
  - `safeNextPath(raw)` — returns `raw` only when it is an in-app path (starts with
    `/app`, single leading slash — rejects `//host`, `http(s)://`, everything else);
    otherwise `/app/dashboard`. Open-redirect guard.
  - `loginUrlFor(pathname, search)` — `/login?next=<encoded path+search>` for `/app/...`
    paths, plain `/login` otherwise.
- `AuthGuard`: while `!resolved`, render null and do **not** redirect (this alone fixes
  reload-in-place: the session resolves and the children render at the same URL with no
  navigation). Once resolved with no identity, redirect to `loginUrlFor(location)` so the
  target survives the round-trip.
- `LoginForm` (both live + demo): on successful sign-in, forward to
  `safeNextPath(new URLSearchParams(window.location.search).get("next"))` instead of the
  hardcoded dashboard. Reading `window.location` at event time avoids `useSearchParams`
  (and its Suspense/prerender requirement) — the login page stays statically prerendered.

Out of scope: any consent change (verified at parity), role gating changes (iOS parity is
deliberate).

## Testing

- Pure: `safeNextPath` (accepts `/app`, `/app/patients/x/forms/y?a=b`; rejects `null`,
  `""`, `//evil`, `http://evil`, `/login`, `app/x`) and `loginUrlFor` (encodes path+search;
  non-app paths get plain `/login`).
- Manual live QA on production infra: reload a patient-file URL signed in (stays put),
  paste a deep URL signed out (login → lands on that URL), demo unaffected.
