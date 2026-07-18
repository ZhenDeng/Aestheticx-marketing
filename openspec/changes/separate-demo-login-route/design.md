## Context

Demo/live mode is currently a pure function of the build environment. Two modules read it
independently:

- `src/lib/demo/auth.tsx:40` — `const mode: Mode = isFirebaseConfigured() ? "live" : "demo"`
- `src/lib/demo/store.tsx:155` — `const live = isFirebaseConfigured()`

Because it is deployment-wide, the demo and the real login can never both work on one
deployment. With Firebase env set (local `.env.local`, and Vercel), `/login` renders
`LiveLogin` and `DemoLogin` is dead code in production. The E2E suite exercises the demo only
because it runs with no Firebase env at all.

Constraints inherited from the existing code:

- `/login` is deliberately kept statically prerendered — `LoginForm` reads `window.location`
  at call time rather than using `useSearchParams`, to avoid forcing a Suspense boundary
  (`LoginForm.tsx:10-13`). Any new work must not regress that.
- Live mode resolves identity asynchronously; `resolved` gates `AuthGuard` so a deep `/app`
  URL is not bounced while a persisted Firebase session is still restoring
  (`auth.tsx:16-21`). The mode override must not open a window where a stale live identity
  leaks into a sandbox tab, or where the guard redirects prematurely.
- `authRedirect.ts` is pure and unit-tested with no React/Firebase imports. Keep it that way.

## Goals / Non-Goals

**Goals:**

- `/demo` and `/login` both work on the same production deployment, simultaneously, for
  different visitors.
- Sandbox activation is per-tab and leaves no trace for other visitors or other tabs.
- One source of truth for mode, so the store and the auth provider cannot disagree.
- `/login` stays statically prerendered.

**Non-Goals:**

- Changing the marketing nav. The existing `NAV_LINKS` "Log in" → `/login` entry stays as-is;
  surfacing a "Try the demo" CTA is a separate design decision.
- Persisting sandbox data across reloads. The demo remains in-memory and resets on refresh —
  that is existing, intended behaviour.
- Any backend, Firestore, or Cloud Functions change.
- Letting a single tab hold a sandbox session and a live session at once.

## Decisions

### 1. `sessionStorage`, not `localStorage` or a URL parameter

Sandbox mode is stored under `ax.demoMode` in `sessionStorage`.

- **`localStorage`** would make the sandbox sticky across every tab and survive browser
  restarts — a clinician who once clicked "demo" could later find their real login silently
  sandboxed. Unacceptable failure mode.
- **A URL parameter** (`?demo=1` on every `/app` route) would survive reloads but pollute
  every in-app link, leak into shared/bookmarked URLs, and require threading through every
  `router.push`.
- **`sessionStorage`** is per-tab, survives reloads and in-app navigation within that tab, and
  dies with the tab. It matches the demo's "resets on refresh" character.

The module `src/lib/demo/demoMode.ts` is pure with `Storage` injected, mirroring the existing
`src/lib/demo/loginPrefs.ts` pattern, so it unit-tests without a DOM.

### 2. Mode becomes provider state, read after mount — with a tri-state to close the race

```
const envLive = isFirebaseConfigured();
const [demoOverride, setDemoOverride] = useState<boolean | null>(null); // null = not yet read
const mode: Mode = !envLive || demoOverride === true ? "demo" : "live";
```

`null` means "the sessionStorage read has not happened yet". This matters for two reasons:

- **Hydration.** Reading `sessionStorage` in a lazy `useState` initializer would make the
  server-rendered HTML (always live) disagree with the first client render. Starting at `null`
  makes server and first client render identical; a mount effect then reads storage and
  commits the real value.
- **Stale-identity race.** The live Firebase watcher effect must not subscribe during the
  `null` window. If it did, on a Firebase-configured deployment it could restore a persisted
  live session and set `identity` moments before mode flipped to `demo` — leaking a real
  clinician's identity into a sandbox tab. The effect therefore guards on
  `mode !== "live" || demoOverride === null`. The delay is one commit.

Alternative considered: flip the mode and clear identity reactively afterwards. Rejected —
it relies on cleanup ordering to prevent a real-identity flash, which is exactly the kind of
thing that regresses silently.

### 3. `resolved` is derived, not stored

```
const [liveResolved, setLiveResolved] = useState(false);
const resolved = mode === "demo" ? true : liveResolved;
```

The current `useState(mode !== "live")` snapshots mode at first render. With mode now able to
flip live → demo after mount, a stored `resolved` would stay `false` forever in a sandbox tab,
and `AuthGuard` would render `null` indefinitely — a blank app. Deriving it removes that
whole class of bug. Demo mode resolves immediately, as it does today.

### 4. Entering and leaving the sandbox are explicit provider actions

- `enterDemoMode()` — writes the flag, sets the override, and clears `identity` /
  `availableIdentities`. It deliberately does **not** sign the user out of Firebase: that
  would be a destructive side effect of merely visiting a marketing page, and the watcher has
  already unsubscribed, so a dormant Firebase session cannot interfere. The user's real
  session is still there when they return to `/login`.
- `exitDemoMode()` — clears the flag and the override, and clears `identity` so a sandbox
  identity cannot survive into the live form.
- `signOut()` also clears the flag, so signing out of the demo returns the tab to live mode.

`/demo` calls `enterDemoMode()` from a mount effect; the live login form calls
`exitDemoMode()` from a mount effect. Putting the exit call in the client form rather than in
`login/page.tsx` keeps the page a server component and preserves static prerendering.

### 5. `loginUrlFor` takes the mode as an argument

`loginUrlFor(pathname, search, mode)` returns a `/demo…` or `/login…` target. Passing mode in
keeps `authRedirect.ts` pure and unit-testable — the alternative, importing the auth context
there, would couple a pure module to React and break its existing tests. `AuthGuard` supplies
the mode it already reads from `useDemoAuth()`.

`DemoLogin`'s existing `nextDestination` reads `window.location.search`, so `?next=` works
unchanged once the picker is served from `/demo`.

### 6. `store.tsx` derives `live` from the provider

`store.tsx` already calls `useDemoAuth()` on the line after its `isFirebaseConfigured()` call,
so this is a one-line change that deletes a duplicated source of truth rather than adding
indirection.

### 7. `/login` no longer falls back to the demo picker

When Firebase is unconfigured, `/login` renders a short "sign-in is not configured" state
linking to `/demo`, instead of silently showing the role picker. That silent fallback is the
conflict this change exists to remove. The cost is E2E churn: the suite runs without Firebase
env, so `e2e/helpers.ts`, `a11y.spec.ts`, `e1-login.spec.ts` and `playwright.config.ts` move
to `/demo`. `e2e-emulator/` runs against the Firebase emulator (configured → live) and keeps
using `/login`.

## Risks / Trade-offs

- **A live identity leaking into a sandbox tab** → closed by the `demoOverride === null` guard
  on the watcher effect (Decision 2); covered by a provider test that asserts the watcher does
  not subscribe before the storage read.
- **Blank `/app` in a sandbox tab if `resolved` were stored** → closed by deriving `resolved`
  (Decision 3); covered by a test that flips mode after mount and asserts the guard redirects.
- **Store and provider disagreeing mid-flip** — both now read the same `mode`, and React
  commits them in the same pass, so there is no window where the store thinks "live" while
  the provider says "demo".
- **`sessionStorage` unavailable** (Safari private mode historically, embedded webviews) →
  `demoMode.ts` wraps access in try/catch and reports "not requested" on failure, degrading to
  today's env-derived behaviour rather than throwing at the provider root.
- **Trade-off: the sandbox does not survive a new tab.** Opening `/app/dashboard` in a fresh
  tab lands in live mode and redirects to `/login`. Accepted — the demo resets on refresh
  anyway, and per-tab scoping is what makes coexistence safe.
- **Trade-off: E2E churn across seven files.** Accepted; it is a faithful consequence of the
  new contract, and leaving `/login` dual-purpose would preserve the exact ambiguity being
  removed.

## Migration Plan

No data migration. Deploy is a single web-repo change; no backend coordination needed. Rollback
is a revert — the `ax.demoMode` sessionStorage key is ignored by the previous build and expires
with the tab.
