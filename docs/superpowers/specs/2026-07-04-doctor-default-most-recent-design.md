# Doctor defaults to most-recently-called — design

**Date:** 2026-07-04 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirement: *Doctor selection when booking an authorisation appointment* — "The doctor field
SHALL default to the most-recently-called doctor for that user, and MUST NOT be a fixed
hard-coded doctor"; roadmap gap: "doctor default-most-recently-called").

## Problem

`BookConsult` on `/app/availability` defaults its doctor picker to the **first** doctor in the
availability list (`doctors[0]`) — positional, not personal. iOS defaults to
`mostRecentlyCalledDoctor(forUser:)` when that doctor is in the pickable list
(`FeedbackRound2ConsultViews.swift:447-453`), backed by `users/{uid}.lastCalledDoctorId`,
which is written whenever a consult call starts.

## Change (rides the consult-calls branch — the call feature is this feature's writer)

- Pure `defaultDoctorID(doctors, recentDoctorID)` in `backend.ts`: the most-recently-called
  doctor when present in the list, else the first doctor, else null. (iOS parity: a recent
  doctor who is no longer available must not be forced onto the picker.)
- `BookConsult`: `effectiveDoctorID = doctorID ?? defaultDoctorID(doctors, store.mostRecentlyCalledDoctor(me.user.id))`.
  The user's explicit selection (`doctorID` state) always wins; the picker remains changeable
  ("Doctor is required" is already satisfied — the select always holds a value when any
  doctor exists).
- Data source: demo — `lastCalledDoctorByUser` (written by `startConsult`); live —
  `users/{uid}.lastCalledDoctorId` hydrated via `readUserProfile` (written by web
  `startConsult` and by iOS `recordCalledDoctor`). Both landed in the consult-calls slice.

## Tests

`calls.test.ts`: `defaultDoctorID` — recent-in-list wins; recent-not-in-list falls back to
first; no recent falls back to first; empty list → null.

## Out of scope

Persisting a most-recently-called doctor for users who have never started a call (there is
deliberately no other writer — iOS parity).
