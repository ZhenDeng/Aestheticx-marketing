# Scheduled (non-"now") ad-hoc auth requests — design

**Date:** 2026-07-04 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirement: *Doctor online status and always-on authorisations* — "A doctor … SHALL be able
to accept authorisation requests **at any time** regardless of published slots"; roadmap gap:
"scheduled (non-'now') ad-hoc requests").

## Problem

The ad-hoc request card on `/app/availability` (BookConsult) always targets the current
moment: it hard-codes `dateISO = isoDay(store.now)` and `atMinute = nowFlooredTo10(store.now)`.
But an always-accepting doctor takes requests **at any time** — a nurse should be able to put
an ad-hoc consult on that doctor's calendar for tomorrow morning, not only for right now.

Gap analysis (2026-07-04): the deployed `requestAdHocAuth` callable (`adHocAuthTx`) already
accepts an arbitrary `dateISO` + `atMinute` — as does the web demo port
(`src/lib/demo/backend.ts` `requestAdHocAuth`, already covered by `adhoc-auth.test.ts` with
non-"now" times) and the iOS domain layer (`InMemoryBackend+Scheduling.swift`). The "now"
restriction lives **only in this web UI**. No backend or model change is needed.

## Change (web-only, UI + one pure guard)

- **Ad-hoc card gains a "When" choice**: two radio buttons, `Now` (default, unchanged
  behaviour) and `Pick a time`. Picking the latter reveals a date input (`type="date"`,
  `min` = today) and a native time input (`type="time"`, 10-minute step to suggest the slot
  grid) — the same controls the calendar's new-appointment form already uses. The card copy
  changes from "Request an ad-hoc consult now for…" to reflect the chosen mode.
- **Request payload**: `Now` sends `isoDay(store.now)` + `nowFlooredTo10(store.now)` exactly
  as today; `Pick a time` sends the chosen `dateISO` + `minutesFromTime(time)` as-is. The
  typed minute is **not snapped** — the spec allows requests "at any time", and both the demo
  backend and the deployed callable accept any minute (the appointment is always 10 minutes).
- **Past guard (UI-only)**: a pure `isPastSlot(dateISO, minute, nowMs)` in `backend.ts`,
  computed in the **UTC frame** shared by `isoDay`/`nowFlooredTo10` (local-time comparison
  would disagree with `isoDay`'s UTC date near a day boundary — the exact bug class caught in
  the nurse-adhoc increment). When `Pick a time` resolves to an instant earlier than the
  current floored slot, the request buttons disable and the card shows "Pick a time that
  isn't in the past." Neither the demo backend nor the deployed callable rejects past times,
  so this stays a UI affordance — demo/live parity is preserved.
- **Success copy**: scheduled requests confirm with the chosen slot ("Sent an ad-hoc request
  for {name} — {date} at {HH:MM}."); `Now` keeps the current copy.

## Deliberate non-checks (parity with the deployed backend)

- **No overlap / double-book check**: `adHocAuthTx` performs none, so the demo port performs
  none (already documented at `requestAdHocAuth` in `backend.ts`). A scheduled ad-hoc request
  can therefore overlap an existing authorisation appointment, which the appointments spec's
  double-booking rule ("two authorisation appointments on the same doctor MUST NOT overlap")
  would reject on the slot-booking path. Fixing that belongs in `adHocAuthTx` (backend repo,
  separate change) — flagged as a follow-up, not silently patched here where it would create
  demo/live divergence.
- **No availability-window gating**: ad-hoc requests are deliberately never gated by
  treatment hours or published slots (spec: "not constrained by treatment availability
  windows"; matches iOS + deployed backend).

## Tests

`adhoc-auth.test.ts`: `isPastSlot` — past date true / future date false / today earlier-minute
true / today current-floored-slot false / today later-minute false / UTC-frame agreement near
a day boundary (23:xx UTC while local is already tomorrow). The scheduled request path itself
is already covered (existing tests book arbitrary non-"now" times).

## Out of scope

Backend overlap enforcement in `adHocAuthTx` (follow-up above); consult-call launch and
most-recently-called doctor default (separate increments in this job).
