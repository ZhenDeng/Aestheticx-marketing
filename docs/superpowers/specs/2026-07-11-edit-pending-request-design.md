# Edit a pending request in place — Design

**Goal (Tier 3, item #7 of the core-architecture audit):** let the raising nurse **edit an untouched `pending` authorisation request** — one submitted but not yet acted on by the doctor — before it is approved or returned. Today only a doctor-returned (`needsEdit`) request is editable.

**Source of truth:** `~/Downloads/core-architecture.docx` (Core Architecture v1.0). Keeps **demo (in-memory) + live (Firebase) parity**, the house pattern.

## Context / current state

`RequestStatus = "pending" | "needsEdit" | "approved" | "withdrawn"` (`src/lib/demo/types.ts:90`; backend mirror `backend/functions/src/domain.ts:33`). A request is `pending` from submit until the doctor acts (`requireEdit → needsEdit`, `approveRequest → approved`); there is **no `reviewing` status** — a request is `pending` the entire time the doctor has it open.

Editing is limited to `needsEdit` at **four** load-bearing points:
1. UI guard — `src/app/app/patients/[id]/request/page.tsx:224` (`editRequest.status !== "needsEdit"` → "This request can no longer be edited").
2. Demo backend guard — `src/lib/demo/backend.ts:509` (`resubmitRequest` requires `status === "needsEdit"`).
3. Firestore rule — `backend/firestore.rules:246` (nurse update allowed only `needsEdit → pending`).
4. Entry-point "Edit & resubmit" links — `patients/[id]/page.tsx:350`, `authorisations/page.tsx:94` (`status === "needsEdit"`).

`resubmitRequest` (`backend.ts:503`) mutates **items only** and flips `needsEdit → pending`; its live mirror `mirrorResubmitRequest` (`mirror.ts:74`) is a **direct client `updateDoc`** (not a Cloud Function) writing `{items, status:"pending"}`.

## Goals / Non-Goals

**Goals:** a nurse can amend the items of their own `pending` request in place; status stays `pending`; the same request builder is reused; live parity via a widened Firestore rule (no new Cloud Function).

**Non-Goals:**
- **No new `reviewing` status.** "Block editing while the doctor is mid-review" is not representable without threading a new status through both enums, the `onAuthRequestWritten`/reviewer-access trigger, and rules — materially larger than #7. The real race is already closed server-side: the instant the doctor approves/returns, `status != "pending"` and a concurrent pending-edit `updateDoc` is rejected by the rule. So: **edit allowed while `pending`, auto-guarded the moment the doctor acts** — exactly the audit's wording ("edit an untouched pending request *before the doctor acts*").
- **No audit-log entry** for a pending edit (a `pending → pending` items change is a no-transition in `classifyRequestTransition`; demo `resubmitRequest` also writes none). Flagged as a possible follow-up, not built here.
- No change to `doctorID`, `nurse`, `createdAt`, repeats, or invoicing.

## Decisions

1. **Separate `editPendingRequest`, not a widened `resubmit`.** A distinct demo fn + store action + mirror keeps the two transitions honest: resubmit re-opens a `needsEdit` request (`→pending`); pending-edit is items-only with status **unchanged**. Reusing `resubmitRequest` and re-writing `status:"pending"` for a pending request would be a no-op status write that the tightened rule must then special-case; a separate path keeps each rule branch minimal and each transition self-documenting. *Alternative rejected:* one `resubmitRequest` widened to accept `pending` — muddies the "resubmit re-opens review" semantics and the audit story.
2. **Guard: nurse-owner + `status === "pending"`, items-only, keep `status`.** Mirrors `resubmitRequest`'s guard shape (`backend.ts:506-512`) minus the status flip. No `syncReviewerAccess` — the request never left the open set, so reviewer file-access is unchanged.
3. **Live = direct `updateDoc` (items only), reusing the existing pattern.** `mirrorEditPendingRequest(requestId, items)` writes `{items}` and nothing else (not even `status`). The **Firestore rule** gains one `allow update` branch: nurse-owner, `resource.data.status == 'pending' && request.resource.data.status == 'pending'`, `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['items'])`. This is the only backend change — **no new callable**. Deploy the rule before/with the web merge (a live pending-edit is rejected until the rule deploys; degrades to the existing `lastSyncError` banner + rehydrate, never silent corruption — but deploy-first is cleaner).
4. **UI: reuse the builder, distinct copy.** `?edit={id}` already loads a request into the builder and locks the doctor picker. Widen the guard to `status ∈ {needsEdit, pending}`; branch `submit()` to `editPendingRequest` when the target is `pending`, else `resubmitRequest`. Copy differs: pending → "Update the items before the doctor reviews it." (no "resubmit"); `needsEdit` keeps "The doctor asked for a change… resubmit for review." Entry points gain an **"Edit"** link for `pending` (distinct from "Edit & resubmit" for `needsEdit`).

## Layers

- **demo-backend** (`backend.ts`): `editPendingRequest(state, {requestID, items, identity}: ResubmitRequestInput)` — guard nurse-owner + `pending`; return items-only update, status untouched.
- **store** (`store.tsx`): `editPendingRequest` action + type decl (`:33`), wired `applyAndMirror(backend.editPendingRequest, m.mirrorEditPendingRequest)`.
- **live-mirror** (`mirror.ts`): `mirrorEditPendingRequest(requestId, items)` → `updateDoc({items: items.map(encodeMedication)})`.
- **UI** (`request/page.tsx`): widen guard `:224`; `editingPending` branch in `submit()` `:270`; conditional helper copy `:283`. Entry links: `patients/[id]/page.tsx:350`, `authorisations/page.tsx:94`.
- **backend rule** (`~/Documents/AestheticX/backend/firestore.rules`): one `allow update` branch (above) + deploy; OpenSpec change `edit-pending-request` (treatment-authorisations delta) + rules-tests.

## Risks / Trade-offs

- **[Doctor acts mid-edit]** → server rule rejects the stale pending-edit (`resource.data.status != 'pending'`); demo `editPendingRequest` re-checks `status === "pending"` inside the reducer, and `store` must eager-validate before `applyAndMirror` (the "actioned elsewhere" pattern — a `BackendError` thrown inside the setState updater is a render-phase crash with no error boundary; prior increments hit this). The UI page-guard also 404s a no-longer-pending target on next render.
- **[Deploy order]** → rule must ship before/with web; until then live pending-edit → `lastSyncError` banner + rehydrate (no corruption). Demo unaffected.

## Testing (TDD)

- **demo** (`src/lib/demo/__tests__/backend.test.ts`): editing a `pending` request updates items + keeps `status:"pending"`; rejects non-owner nurse, wrong role, and `approved`/`needsEdit`/`withdrawn` status.
- **web UI** (`authorisations/__tests__/authorisations-nurse-view.test.tsx`): a `pending` request shows an "Edit" link (`?edit=`); `approved` shows none.
- **backend rules** (`backend/rules-tests/firestore.rules.test.js`, "request lifecycle"): nurse-owner items-only update while `pending` **succeeds**; the same on an `approved` request, or touching `status`/`doctorId`, **fails**; non-owner nurse fails.
