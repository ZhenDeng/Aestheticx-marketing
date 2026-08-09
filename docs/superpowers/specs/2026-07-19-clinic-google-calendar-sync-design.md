# Shared Clinic Google Calendar Sync — Design

**Date:** 2026-07-19

**Status:** Approved architecture; implementation pending
**Repositories:**

- Web: `/Users/zhendeng/Documents/Aestheticx-marketing`
- Backend: `/Users/zhendeng/Documents/Aestheticx`

## Problem

AestheticX already links a Google account, imports Google Calendar availability and bookings,
and exports unmirrored confirmed treatment appointments. The export is incomplete:

- an AestheticX booking waits for manual **Sync now** or the hourly sweep instead of triggering
  an immediate export;
- connections are keyed by the signed-in user's UID, so a clinic-owned appointment whose
  `ownerId` is the clinic ID is not selected by that user's sync;
- appointments with an existing Google event are skipped, so a reschedule in AestheticX does
  not update Google;
- the UI describes the feature as automatic without showing a useful connection or per-event
  synchronization state;
- the existing exporter copies the free-text appointment note into Google Calendar, which can
  disclose clinical information outside AestheticX.

## Goals

1. A clinic has one shared Google Calendar connection, linked by a clinic admin.
2. A confirmed AestheticX treatment appointment appears on the correct Google Calendar shortly
   after it is saved, without requiring **Sync now**.
3. AestheticX reschedules update the existing Google event; cancellation or no-show removes it.
4. Google failures never roll back or block the AestheticX appointment action.
5. Retries and concurrent triggers do not create duplicate Google events.
6. Existing Google-to-AestheticX ingestion, free/busy import, webhooks, incremental sync, and the
   hourly sweep continue to work for doctor and clinic calendar owners.
7. Google events contain no patient identity, contact information, or clinical notes by default.

## Non-goals

- Exporting authorisation teleconsults (`type: "authSlot"`).
- Exporting patient names, email addresses, phone numbers, treatment categories, or clinical
  notes to Google.
- Letting clinic employees or contractors replace or disconnect the clinic's Google account.
- Allowing a clinic to connect multiple Google calendars in this change.
- Making Google Calendar the source of truth for AestheticX-originated appointments.
- Reworking Apple Calendar/EventKit synchronization.

## Considered Approaches

### 1. Event-driven worker with scheduled reconciliation — selected

An appointment Firestore trigger performs a targeted create, update, or delete against Google.
The existing hourly flow reconciles any missed or failed operations. The appointment write and
Google request are separate failure domains.

This provides low latency without making booking correctness depend on Google availability. It
also fits the existing Cloud Functions, Firestore leases, event metadata, webhook, and hourly
sweep patterns.

### 2. Inline synchronization in booking callables

Each booking, reschedule, and status callable would call Google before returning. This is easier
to trace but makes the user wait on Google and creates an unacceptable ambiguity: the AestheticX
write may commit while the callable reports an error because Google failed afterward.

### 3. Manual and hourly synchronization only

This preserves the current design but does not meet the requested immediate synchronization or
correct rescheduling behavior.

## Ownership and Authorization

Calendar connections are keyed by the AestheticX calendar owner:

| Owner type | Owner ID | Who can link, replace, or disconnect | Who can trigger Sync now |
|---|---|---|---|
| Doctor | Doctor UID | That doctor | That doctor |
| Clinic | Clinic document ID | A member whose `clinics[clinicId]` claim is `admin` | Any clinic member |

The server is authoritative. Client-side button visibility is only a convenience; every callable
revalidates the current token claims.

For a clinic connection, OAuth `state` stores the random nonce, initiating UID, clinic owner ID,
owner type, and expiry. The callback consumes the nonce and writes the returned tokens under the
clinic owner ID. Before storing tokens, the callback re-reads the initiating user's current custom
claims and rejects a clinic link if that user is no longer a clinic admin. The Google refresh token
remains server-only.

## Data Model

### `calendarTokens/{ownerId}` — server-only secret document

Existing independent-doctor documents require no key migration because their owner ID already
equals their UID. The document gains explicit ownership metadata:

```ts
interface StoredCalendarTokens {
  provider: "google"
  ownerId: string
  ownerType: "doctor" | "clinic"
  linkedByUid: string
  accessToken: string
  refreshToken: string
  expiresAtMillis: number
  calendarId: string // initially "primary"
  linkedAt: Timestamp
  updatedAt: Timestamp
}
```

Legacy token documents without `ownerId`/`ownerType` are interpreted as doctor connections whose
owner ID is the document ID. A clinic admin who previously linked Google while using clinic
context linked only their personal UID; they must link once under the new clinic-owned flow.

### `externalBusy/{ownerId}` — readable availability projection

The existing projection remains, but synchronization writes it under the calendar owner ID and
sets `ownerId` to that same value. Clinic members can already read their clinic's projection.

### Appointment synchronization fields

The existing Google reference remains the durable mapping:

```ts
externalCalendarRef?: {
  provider: "google"
  eventId: string
}
```

The event-driven worker also writes a small status object:

```ts
externalCalendarSync?: {
  provider: "google"
  status: "pending" | "synced" | "failed"
  contentHash: string
  updatedAt: Timestamp
  errorCode?: string
}
```

`contentHash` covers only fields exported to Google: owner, appointment type/status, date, start,
end, and generic event kind. It prevents status-only writes and duplicate Firestore deliveries
from producing redundant Google requests. `errorCode` is a bounded internal category, never raw
Google response text or tokens.

## Google Event Shape and Privacy

Only confirmed `treatment` appointments whose source is not `google` are mirrored. The event is:

```ts
{
  id: deterministicGoogleEventId(appointmentId),
  summary: "AestheticX appointment",
  description: "",
  start: { dateTime, timeZone },
  end: { dateTime, timeZone },
  extendedProperties: {
    private: { aestheticx: appointmentId }
  }
}
```

The deterministic event ID is `ax` plus a lowercase hexadecimal SHA-256 digest prefix of the
Firestore appointment ID. It satisfies Google's event-ID alphabet and makes a retried insert
idempotent even if Google accepted the event before the function lost its response.

Patient name, lead details, appointment notes, treatment details, and clinical identifiers are
never placed in the event. Existing mirrored events are normalized to this privacy-safe shape by
the hourly reconciliation, which clears descriptions previously populated from appointment notes.

## Synchronization Decisions

A pure decision function compares the before/after appointment snapshots and connection state:

| Before | After | Google action |
|---|---|---|
| Missing | Confirmed treatment, non-Google source | Insert/upsert |
| Active mirrored appointment | Exported date/start/end changed | Patch |
| Awaiting confirmation | Confirmed | Insert/upsert |
| Confirmed mirrored appointment | Cancelled or no-show | Delete |
| Any | Completed | No external change; retain historical event |
| Any Google-sourced appointment | Any | No outbound action |
| Any auth-slot appointment | Any | No outbound action |
| Status/ref/status-object-only write | Same exported content | No action |

If the owner has no linked Google connection, the worker is a successful no-op and removes no
appointment data. Linking later causes the full reconciliation to mirror eligible appointments.

The worker uses owner-scoped synchronization leases so an appointment trigger, webhook, manual
sync, and hourly sweep cannot race to create duplicate events. Google operations occur after the
appointment write and use retry-enabled Cloud Functions. A failed attempt records `failed`, then
throws so the platform can retry; the next attempt moves the status through `pending` to `synced`.

## Inbound Google Synchronization

`performGoogleSync` changes from UID-scoped to owner-scoped:

- refresh tokens are loaded by `ownerId`;
- free/busy writes to `externalBusy/{ownerId}`;
- appointment queries use `ownerId`;
- ingested events use the connection's `ownerType` and `ownerId`;
- webhook channel records route to `ownerId`;
- the hourly sweep iterates owner-scoped token documents.

The linked Google account's primary calendar ID discovered from `calendarList` is used as the
account identity when filtering attendees. It replaces the current assumption that
`users/{uid}.email` exists, which is invalid for a clinic owner ID.

Google-originated events keep `source: "google"` and are never echoed back. Existing incremental
sync tokens and `410 Gone` full-resync behavior remain unchanged.

## API Changes

### `googleCalendarAuthUrl`

Request:

```ts
{ ownerId: string }
```

The server derives owner type and rejects unauthorized management. The returned URL remains the
same shape.

### `googleCalendarConnectionStatus`

Request:

```ts
{ ownerId: string }
```

Response:

```ts
{ linked: boolean; ownerId: string; ownerType: "doctor" | "clinic" }
```

Any owner/member who may view that calendar can request status. No token or Google credential is
returned.

### `disconnectGoogleCalendar`

Request:

```ts
{ ownerId: string }
```

Only the owner doctor or clinic admin may disconnect. It stops known watch channels best-effort,
deletes the owner token and channel documents, and retains existing Google events. Retaining
events avoids destructive surprises; the user can remove them from Google separately.

### `syncGoogleCalendar`

Request becomes:

```ts
{ ownerId: string; timeZone: string }
```

The server validates view membership and runs the existing shared flow for that owner.

## Web Experience

The External Calendar card is owner-aware:

- independent doctor context manages the doctor's connection;
- clinic context reads and synchronizes the clinic connection;
- **Link Google Calendar**, **Replace connection**, and **Disconnect** appear only for the owner
  doctor or clinic admins;
- all clinic members can see **Connected** / **Not connected** and use **Sync now**;
- the copy states that the shared connection applies to all clinic appointments;
- appointment details show **Synced to Google**, **Google sync pending**, or
  **Google sync needs attention** when an `externalCalendarSync` value exists.

The UI never displays a token or raw provider error. Demo mode remains non-OAuth and continues to
show seeded external busy times.

## Error Handling and Recovery

- Appointment create/reschedule/status actions return based only on the AestheticX write.
- Missing/revoked Google credentials set the connection operation to failed without changing the
  appointment.
- `401` refresh failures remain recoverable by a clinic admin replacing the connection.
- Google `404`/`410` on update clears the stale reference and performs an idempotent insert.
- Google `404`/`410` on delete counts as success.
- Transient `429` and `5xx` responses throw for retry.
- The hourly sweep reconciles confirmed events, updates stale event content/times, removes
  cancelled/no-show mirrors, renews channels, and imports missed Google changes.
- A per-owner lease serializes trigger, webhook, manual, and scheduled work.

## Testing Strategy

### Backend pure tests

- owner-management permission matrix: self doctor, clinic admin, clinic employee, unrelated user;
- legacy token ownership normalization;
- before/after synchronization decision table;
- deterministic Google event ID stability and valid alphabet;
- privacy-safe Google body excludes names, leads, and notes;
- create/update/delete response handling and stale-reference recovery;
- status-only writes are no-ops;
- Google-sourced and auth-slot appointments never export.

### Backend integration tests

- clinic admin OAuth state resolves to `calendarTokens/{clinicId}`;
- employee cannot link/replace/disconnect but can run sync;
- clinic-owned confirmed appointment creates exactly one event under repeated delivery;
- reschedule patches the same event ID;
- cancel/no-show deletes the event;
- Google failure leaves the appointment committed;
- clinic inbound event becomes a clinic-owned appointment;
- hourly reconciliation corrects missed changes and strips legacy descriptions.

### Web tests

- owner ID is sent by link/status/sync/disconnect wrappers;
- clinic admin sees management controls;
- clinic employee sees status and Sync now but no management controls;
- appointment detail maps synchronization states to the expected copy;
- demo behavior remains unchanged.

### Verification

- targeted backend unit and integration suites;
- full backend Functions test suite and TypeScript build;
- targeted web calendar/availability tests;
- full web test suite, lint, and Next.js production build;
- emulator or staging smoke test: link clinic, create, reschedule, cancel, and observe the same
  deterministic Google event through its lifecycle.

## Deployment and Migration

1. Deploy backend owner-aware OAuth/status/disconnect/sync callables and the appointment trigger.
2. Deploy the web owner-aware External Calendar card and appointment sync badges.
3. Existing doctor connections continue working because their token document key equals owner ID.
4. Clinic admins link the shared clinic calendar once after deployment.
5. The first clinic sync imports free/busy and Google bookings and mirrors eligible confirmed clinic
   appointments. The hourly sweep provides ongoing reconciliation.

Backend deployment precedes web deployment so the new client parameters and status call are
available when the UI ships.

## Acceptance Criteria

1. A clinic employee creates a confirmed treatment appointment; one privacy-safe event appears on
   the clinic's linked Google Calendar without pressing **Sync now**.
2. Moving or resizing that appointment updates the same Google event.
3. Cancelling or marking it no-show removes that Google event; completing it retains the event.
4. Repeated Firestore deliveries and retries never create a duplicate event.
5. An unavailable Google API does not fail or roll back the AestheticX action.
6. A clinic employee cannot link, replace, or disconnect the clinic Google account.
7. A clinic admin can link, replace, and disconnect it.
8. No patient identity or appointment note appears in the Google event.
9. Independent doctor synchronization and Google-to-AestheticX ingestion continue to work.
