# identity-claims-propagation Specification

## Purpose
TBD - created by archiving change claims-revocation-propagation. Update Purpose after archive.
## Requirements
### Requirement: Claims changes reach signed-in sessions promptly
When the Function-managed `claimsRevision` on the signed-in user's own `users/{uid}` doc changes after sign-in, the client SHALL force an ID-token refresh so the updated custom claims (and therefore the resolved identity set) apply within seconds rather than at the next scheduled hourly refresh. The initial snapshot SHALL only record a baseline (sign-in just minted a fresh token), unrelated user-doc edits SHALL NOT trigger a refresh, and a watch failure SHALL degrade silently to the scheduled refresh. The watcher SHALL be scoped one-per-signed-in-uid and torn down at sign-out.

#### Scenario: Admin revokes the employee kind while the doctor is signed in
- **WHEN** a super admin removes `employee` from a doctor's clinic relationship kind set while the doctor has an active session
- **THEN** within seconds the doctor's session refreshes its token and the clinic identity disappears from the "Practise as" list

#### Scenario: Profile edit does not thrash tokens
- **WHEN** the user edits their profile (users doc changes without a `claimsRevision` bump)
- **THEN** no forced token refresh occurs

### Requirement: The active identity never outlives the identity set
When identity re-resolution produces a set that no longer contains the currently selected identity, the client SHALL fall back to a still-held identity (the remembered one if still held, else the default) instead of leaving the revoked identity active or selectable. While the selection is still held, re-resolution SHALL keep it.

#### Scenario: Practising as a clinic that is revoked
- **WHEN** a doctor is practising as a clinic identity and a token refresh removes that identity from the resolved set
- **THEN** the active identity falls back to a held identity and the revoked one is neither active nor selectable

#### Scenario: Routine refresh keeps the selection
- **WHEN** a routine token refresh resolves the same identity set
- **THEN** the currently selected identity is unchanged

