# Profile / forms / calendar feedback — design

**Date:** 2026-07-06 · **Request:** six pieces of owner feedback (below). Each is small and
mostly independent; grouped into one change because they share no risk surface.

## The six items

### 1 + 2 — Per-identity address in the profile
Phone and address are already editable in `/app/profile`
([profile/page.tsx](../../../src/app/app/profile/page.tsx) `ProfileFieldsEditor`), saved via
`updateProfile` keyed by **user id** (`profileByUser`). Feedback: *the same user practising
under different roles should have different addresses.*

**Confirmed model (owner):** address is keyed by the **full identity** — user + role +
context (independent vs a specific clinic) — so every "Practise as" entry has its own
address. **Phone and AHPRA stay account-wide** (only address is per-identity; AHPRA is
already account-level).

**Design:**
- New `addressByIdentity: Record<string, string>` on `DemoState` (key
  `` `${identity.user.id}:${identityKey(identity)}` ``, reusing
  [identityKey](../../../src/lib/demo/identityPrefs.ts)).
- `addressForIdentity(state, identity)` → `addressByIdentity[key] ?? profileForUser(state,
  uid).address` (per-user address stays the fallback/default, e.g. the value seeded by
  `createUser`).
- `setAddressForIdentity(state, identity, address)`.
- Profile UI: the **Address** field reads/writes the per-identity value (via the active
  identity `me`); **Phone/AHPRA** keep saving per-user via `updateProfile`.

**Live-backend note (out of scope, flagged):** per-identity addresses need a Firestore
schema + rules change in the separate AestheticX backend repo. Here it is implemented in the
in-memory demo store; in live mode the resolver falls back to the existing per-user address,
and per-identity edits are session-only until the backend lands. Mappers/hydrate/mirror and
the direction PDF (which takes a **manually entered** "Principal place of practice", not the
profile address — [DirectionDialog.tsx:81](../../../src/components/app/DirectionDialog.tsx))
are unaffected.

### 3 — Add "Aesthetic History" to the "Send a link" dropdown
`remoteSigningTemplateKinds()` deliberately filters out `aestheticHistory`
([remoteSigning.ts:10](../../../src/lib/demo/remoteSigning.ts)); the on-device consent page
uses the full `FORM_TEMPLATE_KINDS` list, so the form is available there but not for remote
signing. Feedback: it should be available to send as a link too. **Change:** return the full
list (drop the exclusion). Update `remote-signing.test.ts` accordingly.

### 4 — Reformat the "conditions" screening question
The `conditions-screen` prompt ([forms.ts:85](../../../src/lib/demo/forms.ts)) is one long
run-on with semicolon-separated clauses. Feedback: put each clause on its own line.
**Change:** reformat the prompt to a lead-in ("Do you have any of the following?") followed by
one clause per line (bulleted). Render it with `whitespace-pre-line` at the consent question
card ([consent/page.tsx:85](../../../src/app/app/patients/[id]/consent/page.tsx)). The
completed-form review ([forms/[formId]/page.tsx:120](../../../src/app/app/patients/[id]/forms/[formId]/page.tsx))
renders the prompt inline with default white-space, so the newlines collapse to spaces there
— unchanged appearance. Wording is unchanged (only whitespace/bullets added); recorded answers
key on `questionID`, so records are unaffected.

### 5 — Week is the default calendar view
`useState<View>("day")` → `"week"` ([calendar/page.tsx:57](../../../src/app/app/calendar/page.tsx)).
The "New appointment" button is day-only; from week view a day is opened by tapping its header
(`openDay` → `setView("day")`), so the affordance stays reachable.

### 6 — "Record signed consent" requires all questions answered + signature
Today the button is gated only on `!hasSig`; an untouched question has no entry in `answers`
and silently records as "No" ([consent/page.tsx:49,126](../../../src/app/app/patients/[id]/consent/page.tsx)).
**Confirmed (owner):** require an explicit answer to **every** question, **and** the detail
when a "Yes" asks for it, before enabling the button (in addition to the signature).

**Design:** a pure helper `formAnswersComplete(template, answers)`:
- `yesNo` question → an entry must exist (explicit Yes or No). If the answer is **Yes** and
  `detailPrompt !== null`, the `detail` must be non-empty (trimmed).
- `text` question → `detail` must be non-empty (trimmed).
- All questions must pass. Button `disabled = !hasSig || !complete || busy`.

## Testing

- **#2** — `addressForIdentity` returns the per-identity override when set, else the per-user
  default; `setAddressForIdentity` isolates identities (editing `nurse·independent` doesn't
  change `nurse·clinic`); phone/AHPRA remain per-user.
- **#3** — `remoteSigningTemplateKinds()` includes `aestheticHistory`.
- **#6** — `formAnswersComplete`: false when a question is untouched; false when a "Yes" needs
  detail and it's blank; true when every question is answered (and required details filled).
- **#4/#5** — presentational; covered by build + lint + live QA.
- Gate: full `npm test` + `npm run build` green, changed files lint clean, live QA of the
  profile per-identity address, the remote dropdown, the reformatted question, the week
  default, and the consent button gating.

## Design note

UI changes are small tweaks to existing components (no new screens), so no separate
`frontend-design` pass — the micro-UI is specified inline above and validated live in Review.

## Tasks

- [ ] #2 — `addressByIdentity` state + `addressForIdentity`/`setAddressForIdentity` + store wiring (tests first).
- [ ] #2 — profile UI: address per-identity; phone/AHPRA stay per-user.
- [ ] #3 — `remoteSigningTemplateKinds()` includes `aestheticHistory` (+ test update).
- [ ] #4 — reformat `conditions-screen` prompt + `whitespace-pre-line` render.
- [ ] #5 — calendar default view `week`.
- [ ] #6 — `formAnswersComplete` helper (tests first) + button gating.
- [ ] Verify: `npm test`, `npm run build`, live QA of all six.
