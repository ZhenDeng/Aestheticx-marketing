# Design: feedback-1707-regression-fixes

## Context

The 16/07 change fixed the first-login claims wipe at the root (`completeFirstLogin` derives claims from server truth) and added two recovery surfaces: a superAdmin-only `syncUserClaims` callable and a manual "Repair access" button in the web admin console. Investigation (17/07) confirmed: the callable is deployed to australia-southeast1, it successfully repaired the affected nurse account (claims now `roles: ["nurse"]`, post-repair sign-in + token refresh observed), and every Firestore rule the nurse-scope hydrate touches is provable for a clinic-less nurse. Owner feedback: remove the manual button, make recovery automatic, and fix the accounts-list horizontal overflow it introduced (rows carry up to three `flex-none` buttons that never wrap).

Two repos: backend `~/Documents/AestheticX` (branch `fix/1707-claims-autoheal`), web `~/Documents/Aestheticx-marketing` (branch `fix/1707-claims-autoheal-admin-layout`). Spec artifacts live in the web repo.

## Goals / Non-Goals

**Goals**
- Zero-touch recovery: a wiped account heals itself on its next sign-in.
- Delete the manual repair UI (button + its state machine) entirely.
- Accounts list never overflows the horizontal viewport; actions wrap.

**Non-Goals**
- No blocking sign-in functions (GCIP `beforeSignIn`) — needs Identity Platform upgrade, overkill for a already-root-fixed bug class.
- No change to `completeFirstLogin` (already fixed) or to the superAdmin arm of `syncUserClaims`.
- No broader admin-console redesign; only the row-wrap fix.

## Decisions

**D1 — Self-heal via a self-repair arm on the existing `syncUserClaims` callable** (vs a new `repairOwnClaims` callable, vs a Firestore trigger on `users/{uid}`).
Authorization becomes: superAdmin may repair anyone; any authenticated caller may repair **exactly themselves** (`event.data.userId === event.auth.uid`, and a missing `userId` defaults to self). Claims are already derived purely from the caller's `users/{uid}` doc via the unit-tested `claimsFromUserDoc`, so the self arm cannot escalate: you get what your profile records, nothing more. Reusing the callable keeps one code path, one test surface, and no new deploy artifact. A trigger was rejected because the wipe signature lives on the *token*, not the doc — the doc never changed, so there is nothing to trigger on.

**D2 — Client-side detection point: `identitiesForUser` in `src/lib/firebase/auth.ts`** (vs the permission-error banner path in the store).
`identitiesForUser` already reads both the token claims and the `users/{uid}` doc — the two halves of the wipe signature — at every sign-in/token change. When token `roles` is empty and the doc's `roles` is non-empty: call `syncUserClaims`, `getIdToken(true)`, re-read the token result once, then resolve identities. Guard with a single-attempt flag per resolution (no retry loops). Failures fall through to the current behaviour (empty identities → existing categorised permission banner), so sign-in can never be *worse* than today. The store's existing force-refresh-on-permission-error self-heal stays as the belt to this suspenders.

**D3 — Layout: wrap the action cluster, not the whole row.**
`AccountRow` becomes a two-part flex row: identity block (`min-w-0 flex-1`, truncating) and an actions cluster in its own `flex flex-wrap justify-end gap-2` container with `min-w-0`; the outer `<li>` gets `flex-wrap`. At narrow widths the cluster wraps below the identity line instead of widening the page. Removing the Repair button also drops the widest row to two buttons + badge. No `overflow-x-auto` band-aid on the list (the ticket explicitly asked for wrap/constraint fixes, and a scrolling account list hides actions).

**D4 — Web degrades safely against an un-deployed backend.** If the relaxed callable isn't deployed yet, a wiped non-admin self-repair gets `permission-denied` — exactly today's behaviour — and the catch falls through to the current banner. So web-first deploy is safe, though backend-first is still the documented order.

## Review hardening (17/07 engineer review)

- **Self-wipe guard (backend):** a non-admin self-repair that derives NO roles from the doc is refused (`failed-precondition`) — `setCustomUserClaims` replaces the full set, so syncing an empty doc would wipe a healthy account. Super admins stay unblocked: clearing doc roles then syncing IS the revocation path (the users doc is the claims authority — deliberate; claims-only revocation is not a supported state).
- **Payload semantics (backend):** `userId: null` ≡ missing ≡ self; non-string `userId` → `invalid-argument`, never a misleading `permission-denied`.
- **Heal latch (web):** one repair attempt per uid per page session — bounds the claims-propagation-lag edge where a refreshed token re-fires the token watcher. Heal failures are console-logged, not silent.
- **Watcher races (web, pre-existing but widened):** a stale identity resolution settling after sign-out no longer resurrects a ghost session (`currentUserUid` guard); a resolution failure lands on signed-out instead of an infinite loading screen.
- **Noted, unchanged:** no rate-limit/App Check on the callable (matches every other callable's posture; self-arm writes are bounded to the caller's own account).

## Risks / Trade-offs

- [Self-repair loop on a genuinely role-less account (doc has no roles)] → detection requires the *doc* to carry roles; a doc without roles never triggers the call.
- [Extra callable latency at sign-in for wiped accounts] → only fires on the wipe signature, which post-root-fix should be near-extinct; healthy sign-ins make zero extra calls.
- [Removing the button removes the admin's proactive fix-before-they-notice tool] → superAdmin arm of the callable remains scriptable; accepted by owner (17/07 decision).
- [Token refresh races the callable's claim write] → `setCustomUserClaims` completes before the callable resolves; `getIdToken(true)` afterwards is strictly ordered.

## Migration Plan

1. Backend PR → merge → `firebase deploy --only functions:syncUserClaims`.
2. Web PR → merge → Vercel auto-deploy.
3. Rollback: revert web (button-less UI keeps working; self-heal call fails closed to today's banner); backend revert restores superAdmin-only arm.

## Open Questions

_None — owner decisions captured 17/07 (remove button, auto-heal, overflow is the accounts list)._
