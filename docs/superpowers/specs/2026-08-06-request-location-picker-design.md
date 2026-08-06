# Choose the location when raising an authorisation request

**Date:** 2026-08-06
**Owner feedback:** "independent clinician 状态下，send authorisation request 的时候，能不能给我加一个选项，选择 location，这样省的自动 generate 的时候出错"

## Problem

An independent nurse's authorisation request is stamped with a premise of administration at
submission (`backend.submitRequest` → `activePremise(profile)`), which resolves to
`selectedPremiseId ?? defaultPremiseId ?? premises[0]`. That selection lives in two *global*
places — the dashboard's "Working from" switcher and Profile → Premises of administration —
and nowhere on the request form itself.

So the address printed on a legal document depends on state the clinician set at some earlier
point, on another page, and cannot see while raising the request. Working at a different
location without switching first silently stamps the wrong address, and the mistake surfaces
only on the generated authorisation.

## Decisions (owner, 2026-08-06)

1. **Per-request only.** The location chosen on the form stamps that request and nothing else;
   `selectedPremiseId` / `defaultPremiseId` are untouched. Raising a request must not silently
   mutate state that other surfaces render.
2. **Editable while editing.** The picker also appears when editing a pending request or
   resubmitting a needs-edit one, so a wrong stamp is fixed in place rather than by withdrawing
   and re-raising.
3. **Preselected, not blank.** It defaults to the profile's current premise and sits directly
   above the submit button, so the address is visible before submitting. Forcing a manual pick
   every time would add friction without adding information.

## Approach

Thread an optional `premiseId` through the existing store/backend request methods. When present,
the reducer resolves that premise from the caller's profile and stamps it; when absent, behaviour
is exactly today's `activePremise()`.

This keeps demo and live on one code path and leaves every other caller (including iOS) working
unchanged. The web already writes the `authRequests` document itself, so no Cloud Function
changes — but see the security-rules constraint below, which splits the work across two repos.

### Security-rules constraint (discovered during design)

`backend/firestore.rules` pins the exact field set a nurse may write:

| Path | Rule today | Premise writable? |
|---|---|---|
| create a request | `keys().hasOnly([… 'premise'])` | **yes** |
| edit a pending request | `diff().affectedKeys().hasOnly(['items'])` | no |
| resubmit a needs-edit request | `diff().affectedKeys().hasOnly(['items', 'status'])` | no |

So decision 3's *new request* picker is a **web-only change that needs no deploy**, while
decision 2's *edit/resubmit* re-stamp is rejected by the live rules until they are widened to
`['items', 'premise']` and `['items', 'status', 'premise']`.

**Deploy order: the backend rules change must be deployed BEFORE the web change merges.**
Shipping the web side first makes "Save changes" fail in live mode with a permission-denied
sync error whenever the location was touched — while demo mode, which has no rules, would keep
working and hide the fault. This is the same backend-first ordering the clinic-membership and
employee-only-nurse changes needed.

Rejected alternatives:

- *Set `selectedPremiseId` before submitting and restore it after.* Mutates global state, which
  decision 1 rules out, and a failure mid-flow leaves the wrong value behind.
- *Build the request object in the page, bypassing the reducer.* Splits demo and live into two
  code paths that will drift.

## Design

### UI

On `/app/patients/[id]/request`, a **Location** field joins the Prescribing doctor field,
directly above the submit row:

- Rendered **only** for an independent nurse identity (`role === "nurse"` and
  `context.kind === "independent"`). A clinic-context request stamps the clinic's own premises
  — deliberately `null` on the request — so the field is absent there, as it is for doctors.
- Each option reads `Name — Address` so the address being stamped is legible, not inferred from
  a nickname.
- With exactly one premise it degrades to a single read-only line showing that premise: still
  visible before submitting, no pointless control.
- With no premises at all the field is omitted and submission behaves as today (nothing to
  stamp); the existing Profile guidance covers adding one.
- Label copy states the consequence: "Printed on the authorisation as the premises of
  administration."

### Data flow

```
request page state: premiseId
  → store.submitRequest / editPendingRequest / resubmitRequest  ({ …, premiseId? })
    → backend reducer: resolvePremise(profile, premiseId) ?? activePremise(profile)
      → request.premise = { id, name, address }
        → live: encodeAuthRequest → setDoc(authRequests/{id})   [unchanged]
        → PDF / DirectionDialog read request.premise             [unchanged]
```

`resolvePremise` is a small pure helper next to `activePremise` in `src/lib/demo/backend.ts`:
given a profile and an id, return that premise or `null`.

### Edit flow

Opening the page in edit mode preselects the premise **already stamped on that request**, so
saving without touching the field is a no-op for the address. A legacy request with no stamped
premise falls back to the profile's current premise. Saving or resubmitting re-stamps from the
field.

### Error handling

- **Stale id** — the chosen premise was deleted in another tab between page load and submit:
  fall back to `activePremise(profile)` rather than stamping a blank address. A missing address
  blocks the direction export downstream, so silently stamping nothing is the worse failure.
- **Clinic context** — a `premiseId` passed under a clinic identity is ignored and `null` is
  stamped, exactly as today. The clinic's address wins; this rule must not be bypassable from
  the client.

### Testing

Backend reducer:
- passing a `premiseId` stamps that premise, not the active one
- omitting it stamps the active premise (today's behaviour preserved)
- a clinic identity ignores a supplied `premiseId` and stamps `null`
- an unknown/deleted id falls back to the active premise

Request page:
- the field renders for an independent nurse and not for a clinic-context nurse
- it defaults to the profile's current premise
- the selected premise id reaches the `submitRequest` call
- edit mode preselects the request's already-stamped premise
- a single-premise profile renders the read-only line instead of a select

## Delivery

Two changes, in this order:

1. **Backend repo** — widen the two `authRequests` update rules to admit `premise`, plus rules
   tests covering "nurse may re-stamp the premise on her own pending request" and "still cannot
   touch patientId / doctorId / nurseId". Deploy.
2. **Web repo** — `resolvePremise` + the optional `premiseId` on the three store/backend methods,
   the Location field, and the tests listed above.

The web change is safe to write and review before the rules deploy; only its merge is gated.
The create path works either way, so if the rules deploy slips, the picker can ship for new
requests alone by holding back the edit-mode wiring.

## Out of scope

The dashboard "Working from" switcher and the Profile premises manager stay exactly as they are;
this adds a per-request override, it does not replace the global default.
