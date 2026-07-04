# Remove self-serve account deletion (web) — design

**Date:** 2026-07-05 · **Request:** "remove delete account button to disallow account to
delete itself."

## Problem

`/app/profile` renders a live-only "Delete account" button (`DeleteAccount` in
`profile/page.tsx`) that deletes the signed-in user's own Firebase Auth record via the
client SDK (`deleteAccount()` in `src/lib/firebase/auth.ts`). The owner wants account
removal to be an administrative act only — the super-admin console (PR #53) now provides
that (deployed `deleteUserAccount` callable, clinical records retained).

## Change

- Remove the `DeleteAccount` component and its render from `profile/page.tsx`.
- Remove the now-dead `deleteAccount()` helper from `src/lib/firebase/auth.ts`.
- Fix the code comment in `AccountRow` that cites `DeleteAccount.performDelete` as the
  async-pattern example (point at `AccountRow.sendReset`'s own precedent instead).

## Deliberate iOS-parity divergence (documented, not hidden)

iOS keeps its in-app deletion because the **App Store requires** account deletion inside
apps that offer account creation; the web has no such requirement, so the web drops the
surface entirely. The web sweep memory/spec notes that the button was "kept for parity" —
this change supersedes that.

**Honest scope note:** removing the button removes the sanctioned self-serve path, but the
Firebase client API (`accounts:delete`) remains technically callable by any signed-in
user, and the iOS app still ships its mandated flow. Truly *blocking* self-deletion
platform-wide would need an Identity Platform `beforeUserDeleted` blocking function —
out of scope here, flagged for the owner.

## Testing

- No behaviour added — gate is the full suite + build green, changed files lint clean,
  and live QA confirming the button is gone from `/app/profile` while the super-admin
  console delete still works.
