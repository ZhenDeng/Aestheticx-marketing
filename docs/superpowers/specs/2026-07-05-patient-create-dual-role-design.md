# Multi-role accounts can't create patients — root cause + fix

**Date:** 2026-07-05 · **Reported:** "create patient can not be done, it always throws
errors — *A change could not be saved to the server. It will reconcile on refresh.*"

## Root cause (confirmed with live evidence)

The banner is the `lastSyncError` reconciliation notice: the optimistic local create
succeeds, then the Firestore mirror write is rejected and the store surfaces the banner.

Systematic-debugging reproduction on production infra (signed in as the bootstrap account,
claims `roles: ["superAdmin","doctor","nurse"]`, acting as doctor), replaying the exact
`setDoc` via the Firestore REST API with the live ID token:

```
POST …/patients?documentId=… → 403 { "status": "PERMISSION_DENIED",
  "message": "Missing or insufficient permissions." }
```

The deployed patient-create rule was:

```
allow create: if signedIn() && !isSuperAdmin() && patientEditable(request.resource.data) && …
```

`isSuperAdmin()` = `'superAdmin' in request.auth.token.roles` — it reads the **token's
roles claim**, not the identity the UI is acting as. So **any account whose claims include
`superAdmin` is blocked from creating patients**, even one that also holds a nurse/doctor
role and is legitimately acting as that role. The web UI offers create whenever the
*selected* identity is clinical (`canCreatePatient = identity.role !== "superAdmin"`), so a
`superAdmin + nurse` account (e.g. the owner's `zhexia`) is shown the form, submits, and
the rule rejects it — every time. Single-role nurse/doctor accounts were unaffected
(control: Dr Jenn, `roles:["doctor"]`, creates patients fine — verified in earlier QA).

The `!isSuperAdmin()` guard was a blunt proxy for "read-only super admins can't create
clinical data." It over-reached to multi-role accounts, which only became possible once the
owner created dual-role logins via the super-admin console / Admin SDK.

## Fix (backend — AestheticX repo, `firestore.rules`)

Replace `!isSuperAdmin()` with a positive, precise check that the creator actually holds
the owning clinical role:

```
function patientCreatorRole(patient) {
  return (patient.ownerType == 'doctor' && hasRole('doctor'))
    || (patient.ownerType == 'nurse'  && hasRole('nurse'))
    || (patient.ownerType == 'clinic' && inClinic(patient.ownerId));
}
allow create: if signedIn()
  && patientEditable(request.resource.data)   // ownerId == uid (doctor/nurse) or inClinic (clinic)
  && patientCreatorRole(request.resource.data)
  && hasAll([mandatory]) && !hasAny(['prescribingDoctorIds']);
```

`patientEditable` already pins ownership to the creator (uid / clinic membership);
`patientCreatorRole` adds "and you hold that role." Together: a **pure** super admin
(no clinical role) is still blocked (intent preserved); a **super admin who is also a
nurse/doctor** can create as that role. iOS shares these deployed rules, so both platforms
are fixed at once.

## Testing

- Rules tests (`backend/rules-tests/firestore.rules.test.js`, run in the Firestore
  emulator): new `nurseAdmin` context `{roles:['superAdmin','nurse']}` — **can** create a
  nurse-owned patient owned by their uid (RED before fix, GREEN after); pure `root`
  super admin **cannot** create (regression guard); existing owner-create and
  mandatory-field cases still pass. 62/62 green.
- Live verify on production infra after `firebase deploy --only firestore:rules`: the exact
  REST create that returned 403 now returns **200**; the full UI create as the dual-role
  account acting as doctor shows **no** error banner. QA patient docs deleted afterwards.

## Scope note

Only the patient **create** rule used the blunt `!isSuperAdmin()`. Every other
`isSuperAdmin()` in the rules either grants extra read access (`|| isSuperAdmin()`) or gates
super-admin-only writes (scriptPricing/availability) — none block a dual-role clinical
action. Note-create already gates on `hasRole('doctor')||hasRole('nurse')`, which a
`superAdmin+nurse` satisfies, so notes were never affected.
