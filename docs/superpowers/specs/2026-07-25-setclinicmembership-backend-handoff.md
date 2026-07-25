# Backend handoff: `setClinicMembership` callable (nurse clinic employment)

**Date:** 2026-07-25
**Repo:** Firebase Functions backend (NOT this web repo)
**Status:** Handoff — web side is merged + deployed (this repo, PR #162); this callable is the only remaining piece for the feature to work in live/production.
**Region:** `australia-southeast1` (all web-facing callables must target this — a wrong region is a silent live break).

## Why this exists

The web feature "nurse clinic employment + invoicing" is live. A super admin can employ a nurse at a clinic in **Admin → Relationships → Employment**. In **demo** mode this works entirely in-memory. In **live** mode the web calls a callable named `setClinicMembership` that **does not exist yet**, so the grant currently rejects and surfaces the sync-error banner. Building + deploying this callable makes the admin grant work in production.

Everything downstream already exists and is deployed — do NOT rebuild them:
- `createServiceInvoice` (deployed, backend PR #115) already lets a **clinic member** invoice their clinic. Once the nurse holds an `"employee"` membership claim, invoicing works with no change.
- The web resolves identities from claims (`identitiesFromClaims`): a non-`admin` clinic membership becomes a clinic-context identity for the account's clinical role (`doctor` if the account holds the doctor role, else `nurse`). So a nurse with `clinics: { <clinicId>: "employee" }` automatically gets a clinic-context **nurse** identity (workspace + patient book).
- The web `selfHeal` + claims-revision watcher already propagate membership-claim changes to a signed-in target's ID token (see the web's `selfHeal.ts` / `watchClaimsRevision`). Your write just has to update the source of truth the same way the doctor-employee path does.

## Exact contract the web already calls

From this repo, `src/lib/firebase/mirror.ts`:

```ts
await httpsCallable(functions(), "setClinicMembership")({
  userId: input.nurseID,   // the nurse's auth uid
  clinicId: input.clinicID, // clinics/{id}
  kind: input.employed ? "employee" : null, // "employee" to grant, null to revoke
});
```

- **Name:** `setClinicMembership`
- **Request:** `{ userId: string; clinicId: string; kind: "employee" | null }`
- **Response:** the web ignores the return value (fire-and-forget mirror). Return `{ ok: true }` (or the resulting membership) — a thrown error is what the web surfaces to the admin via the sync-error banner, so throw `HttpsError` with a clear message on failure.
- **Only** `kind: "employee"` and `kind: null` are sent. Reject any other value. (`"admin"` / `"contractor"` memberships are managed by other paths — do not accept them here.)

## Claims / membership model (already established)

Membership lives in two places that must stay in sync (mirror exactly what the doctor-employee path in `setCooperationRelationship` already does):
1. **Custom claims:** `clinics: { [clinicId]: "admin" | "employee" | "contractor" }` on the user's Firebase custom claims.
2. **`users/{uid}` doc:** the `clinics` map field (the web reads this to detect stale tokens in `selfHeal`, and to resolve the caller's own clinic names).

`identitiesFromClaims` (web) turns each membership into an identity. Reference (do not change): `"admin"` → `clinicAdmin`; otherwise the account's clinical role (`doctor` preferred, else `nurse`).

## Behavior

### Grant — `kind: "employee"`
1. Set `clinics[clinicId] = "employee"` on the target's custom claims **and** the `users/{uid}.clinics` map (idempotent — a repeat grant is a no-op on value).
2. Bump whatever claims-revision / token-invalidation signal the doctor-employee grant already uses, so the target's live session self-heals to include the new clinic identity.
3. Append an audit-log entry with action **`clinic_employment_granted`** (see Audit below).

### Revoke — `kind: null`
1. Remove `clinicId` from the target's `clinics` claims **and** `users/{uid}.clinics`.
2. Bump the claims-revision signal so the target's session drops the identity (see the web's claims-revocation handling — a lingering revoked identity is a stale-token symptom, so the revision bump matters).
3. Append an audit-log entry with action **`clinic_employment_revoked`**.
4. **Provenance:** only withdraw a membership this path granted. Reuse the same provenance-aware revoke branch `setCooperationRelationship` already uses for doctor-employee membership, so a nurse-employee revoke never strips a membership that a different grantor owns. See Edge cases for the doctor+nurse overlap.

## Authorization & validation

- **Caller must be `superAdmin`** (same gate as the other admin callables). Otherwise `HttpsError('permission-denied')`.
- **Target (`userId`) must hold the `nurse` role.** This mirrors the web reducer guard (`account.roles.includes("nurse")`) and keeps the doctor-membership path (cooperation relationships) as the sole writer of doctor memberships. Reject a non-nurse target with `HttpsError('failed-precondition')`.
- **`clinicId` must exist** (`clinics/{clinicId}` present). Reject with `HttpsError('not-found')`.
- Reject `kind` values other than `"employee"` / `null` with `HttpsError('invalid-argument')`.

## Audit log

Write a platform audit-log entry matching the web's `AuditAction` values and the existing `auditLog` writer:
- Grant → `clinic_employment_granted`
- Revoke → `clinic_employment_revoked`
- `targetType: "account"`, target = the nurse's uid, actor = the calling super admin, plus a human-readable summary (e.g. `employed <nurse name> at <clinic name>`). (These two action strings are already in the web `AuditAction` union and the web `mappers.ts` `AUDIT_ACTIONS` allowlist as of PR #162, so live entries render with the right label.)

## Firestore rules

- The `users/{uid}.clinics` field must remain **server-write-only** (writable only via this callable / the cooperation-relationship path with the Admin SDK), never client-writable. Confirm existing rules already forbid client writes to `clinics` (the doctor-employee path relies on this) and that this callable writes with the Admin SDK.
- No new collection is introduced. `clinics/{id}` read rules are unchanged (member-or-superAdmin).

## Edge cases

- **Idempotent grant / revoke-of-non-member:** grant when already `"employee"` → no-op; revoke when not a member → no-op (still safe to return ok; do not error).
- **Doctor+nurse dual-role account:** `clinics[clinicId]` holds a single value per clinic, and `identitiesFromClaims` derives the role as `doctor` when the account has the doctor role. So for a rare doctor+nurse account, a nurse-employee grant here would surface as a *doctor* clinic identity. This is a pre-existing property of the claims model, not introduced here — but because such an account may also hold a doctor-cooperation-relationship membership for the same clinic, use the provenance-aware revoke (above) so the two grantors don't clobber each other. If simpler for v1, you may reject a target that already has a doctor-cooperation membership for that clinic and document it.
- **Contractor kind:** out of scope. Only `"employee"` / `null`.

## Interactions confirmed OUT of scope (no change needed)

- `createServiceInvoice` — already validates clinic membership; passes once the claim exists.
- `identitiesFromClaims`, `selfHeal`, `watchClaimsRevision` — already handle membership add/remove.
- No web change is required after this ships; the web already calls the callable and degrades gracefully (sync-error banner) until it exists.

## Deploy

- Backend-only change; **no web dependency** (web already shipped). There is no "deploy backend first" ordering concern for the web — the web already tolerates the callable's absence.
- Targeted deploy: `firebase deploy --only functions:setClinicMembership` to project `aestheticx-91e6b`, region `australia-southeast1`.

## Acceptance criteria / test plan

- [ ] Callable rejects a non-superAdmin caller, a non-nurse target, a missing clinic, and an invalid `kind`.
- [ ] Grant sets `clinics[clinicId] = "employee"` on both custom claims and `users/{uid}.clinics`; idempotent on repeat.
- [ ] Revoke removes it from both; idempotent when not a member; provenance-aware (does not strip a doctor-cooperation-granted membership).
- [ ] An audit-log doc is written with the correct action and target on each grant/revoke.
- [ ] Integration (emulator or staging): super admin grants a real nurse at a clinic → the nurse's next token (via self-heal) includes a clinic-context nurse identity → the nurse's web "Invoice the clinic" composer lists the clinic and `createServiceInvoice` succeeds. Revoke → the nurse loses the clinic identity and can no longer invoice it.
- [ ] Live smoke after deploy: repeat the above against production with a throwaway nurse account.
