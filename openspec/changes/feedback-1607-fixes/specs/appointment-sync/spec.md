## ADDED Requirements

### Requirement: Dashboard reflects calendar state in real time
The Dashboard's "Upcoming authorisation calls" list SHALL be derived from the same appointment records the Calendar mutates, and in live mode SHALL update in real time (via a listener, without a manual refresh) when an appointment is cancelled, rescheduled, completed or otherwise modified — from this client or any other.

#### Scenario: Cancel in calendar clears the dashboard row
- **WHEN** a doctor cancels an authorisation appointment in the Calendar
- **THEN** the corresponding row disappears from the Dashboard's upcoming-calls list without a page refresh

#### Scenario: Another client's change arrives live
- **WHEN** the nurse who booked the call cancels it from her own device
- **THEN** the doctor's open Dashboard drops the row without a refresh

### Requirement: Destructive appointment actions confirm first
Cancelling an appointment from the Calendar SHALL require an explicit confirmation step before the cancellation executes. Declining the confirmation SHALL leave the appointment untouched.

#### Scenario: Accidental tap does nothing
- **WHEN** a user taps Cancel on an appointment and then declines the confirmation
- **THEN** the appointment remains in its prior status

#### Scenario: Confirmed cancel proceeds
- **WHEN** a user taps Cancel and confirms
- **THEN** the appointment is cancelled

### Requirement: Mark an authorisation call completed from the Dashboard
Each row of the doctor's "Upcoming authorisation calls" list SHALL offer a doctor-only **Mark completed** action that sets the appointment's status to completed, removing it from the upcoming list.

#### Scenario: Doctor completes a call from the dashboard
- **WHEN** the doctor clicks Mark completed on an upcoming authorisation call
- **THEN** the appointment status becomes completed and the row leaves the list
