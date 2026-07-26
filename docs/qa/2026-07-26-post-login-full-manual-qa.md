# Manual QA plan — full post-login regression

**Scope:** every function reachable after signing in — all five roles, all nav tabs, demo and live.
**Date:** 2026-07-26. Covers the app as deployed through web PR #162 (nurse clinic employment) and backend PR #115 (service invoicing).
**How to use:** run the parts in order; each part assumes a fresh demo entry as the named account. A full pass is ~2–3 hours. For a quick smoke, run only the scenarios marked ★.

---

## Before you start

### Environments

| Mode | How to reach it | Notes |
|---|---|---|
| **Demo** | www.aestheticxgroup.com → Sign in → "Try the demo" (or local dev server → `/demo`) | Any password works. Sandboxed per browser tab. |
| **Live** | `/login` with a real account | Only needed for Part 8. |

### Demo accounts (any password)

| Account | Role | Identities |
|---|---|---|
| **Sarah Chen** | Nurse | Independent **and** Lumière Clinic (the identity-switch example) |
| **Ruby Walsh** | Nurse | Lumière Clinic only |
| **Dr Elena Voss** | Doctor | Independent |
| **Ava Lim** | Clinic Admin | Lumière Clinic |
| **Priya Nair** | Platform Admin | Admin shell only |
| **Nadia Okafor** | Nurse | Independent (the removable Employment example) |

### Ground rules

- **The demo resets on any full page reload** (F5, address-bar edits). Navigate only with in-app links; if you refresh mid-scenario, restart the scenario.
- **The demo also resets on any account switch** (Sign out → re-enter reseeds the data — verified 26/07: the store lives in the `/app` layout). Consequence: every cross-account round-trip in this plan (2.3's resubmit loop, 4.3's Ava-receives-Ruby's-invoice, 6.4's re-enter-as-Nadia check) is **live-only**; in demo, test each account against the seeded state.
- Switch accounts with **Sign out** in the header, never the browser back button.
- **Pasting an `/app/...` URL is a full load** — it resets the sandbox and bounces to `/demo?next=…`. To test the role route guards (0.2/0.3), use that `next` round-trip: enter the demo from `/demo?next=%2Fapp%2Fadmin` and check where you land after sign-in.
- The header chip must always read **"Demo · resets on refresh"** in demo and **"Live"** in live. If it's wrong, stop — you're testing the wrong environment.

### Known demo/live differences — do NOT file these as bugs

| Surface | Demo | Live |
|---|---|---|
| Wallet / Account section, top-ups, checkout balances, Client-invoice stream | Visible and working | **Hidden by design** (billing matrix is demo-only) |
| Client invoice from patient file / check-out | Issued **and listed** | PDF/email works but nothing persists; issued list stays empty |
| User admin (create user, reset password, delete) | Read-only cast, disabled button | Fully working |
| Signed-form PDF download | Disabled — "available in live mode" | Works (may need "Check again" while preparing) |
| Google Calendar **Link** button | Hidden; "Sync now" reports seeded busy times | OAuth link + real two-way sync |
| Consult call | Simulated ("In call (simulated)"), no incoming ring | Real video + incoming-ring banner |
| Consent signing link | Local link + "Demo link" banner | Tokenised single-use link |
| Audit log | Current session only | Durable history |
| Cross-account round-trips (2.3 resubmit loop, 4.3 received fees, 6.4 identity re-check) | **Not testable** — data reseeds on account switch | Full round-trips work |
| No-email aftercare guard (1.5) | **Not constructible** — email is required on the patient form and every seeded patient has one | Testable on a real patient without an email |
| Ad-hoc consult panel (3.7) | **Not testable** — needs a doctor's always-accept ON while a nurse session is active; the flag resets on switch | Testable with two accounts |
| Invoice-row ABN caption (4.1) | Never shows — no seeded counterparty has an entity ABN | Shows for entity-holding counterparties |

---

## Part 0 — Login, guards & session ★

### 0.1 Demo entry ★
| Step | Expected |
|---|---|
| Open `/demo` | Radio-card picker of the six accounts; password labelled "any value works in the demo" |
| Pick Sarah Chen, any password, **Enter the demo** | Lands on `/app/dashboard`; header shows the Demo chip + "Sarah Chen" identity badge |

### 0.2 Signed-out guard
| Step | Expected |
|---|---|
| While signed out, paste `/app/patients` into the address bar | Redirected to the login/demo entry; after signing in you land back on `/app/patients` (the `?next=` round-trip) |

### 0.3 Role route separation ★
| Step | Expected |
|---|---|
| As Sarah (nurse), paste `/app/admin` | Bounced to `/app/dashboard` — clinical roles never see the admin shell |
| Sign out → enter as Priya (admin), paste `/app/calendar` | Bounced to `/app/admin` |
| As Priya, nav bar | Only: Admin, Products, Patient lookup, Audit, Profile |
| As Sarah, nav bar | Only: Dashboard, Patients, Authorisations, Calendar, Availability, Invoice, Templates, Bookings, Profile |

### 0.4 Identity switching (Practise as) ★
| Step | Expected |
|---|---|
| As Sarah → Profile | A **"Practise as"** card with two identities: Independent clinician · Nurse, and Lumière Clinic |
| Switch to the Lumière identity | Page tint changes; header badge shows the clinic context; you land on the dashboard |
| Open Patients in each identity | The patient lists differ — the clinic identity sees clinic-owned patients, the independent identity her own |

### 0.5 Sign out
| Step | Expected |
|---|---|
| **Sign out** in the header | Returned to the entry screen; visiting `/app/...` redirects back out |

---

## Part 1 — Nurse: patients & clinical records (as **Sarah Chen**, independent identity)

### 1.1 Dashboard
| Step | Expected |
|---|---|
| Open Dashboard | "Welcome, Sarah Chen" + "Acting as nurse · independent"; tiles for approved-this-month, **Book an authorisation call**, and Today/calendar |
| **Working from** card | Premise radio list (nurse+independent only); selection persists while navigating; "Manage premises ›" goes to Profile |

### 1.2 Patient list & search ★
| Step | Expected |
|---|---|
| Open Patients | Rows show avatar, name, DOB · phone; patients with an alert show an **Alert** chip |
| Search by partial name, by the **displayed preferred name** (e.g. "Coco"), by DOB as `dd/mm/yyyy`, then by a **phone fragment** | Each filters correctly; clearing restores the full list. (Preferred-name and phone-fragment matching shipped with the 26/07 search fix — older builds required given/last name and the full phone number.) |

### 1.3 Create & edit a patient ★
| Step | Expected |
|---|---|
| **New patient** → fill required fields, leave one out | Submit stays disabled until every required field is present |
| Use the Address field | Autocomplete suggestions appear; picking one fills a single address string |
| Create, then open the file → **Edit details** → change phone → save | Change shows on the file |

### 1.4 Patient file basics ★
| Step | Expected |
|---|---|
| Open a seeded patient file | Left: avatar, alert banner (if any), email/address/allergies/medications, Notes, Consent forms. Right: Active authorisations, Raise authorisation request, Open requests, Appointment history, Manage card |
| Add a general note with an attachment → **Save note** | Note appears at the top; expanding shows the attachment |
| **Treatment note** | Form offers "Apply a template…", medication lines with batch/expiry, and records against an authorisation (consumes a repeat) or as a no-script treatment |
| **Delete patient** (on a throwaway patient you created) | Inline confirm first; after confirming, the patient is gone from the list |

### 1.5 Aftercare email hand-off ★
| Step | Expected |
|---|---|
| Patient file → **Send aftercare** | 8 category toggles (Anti-wrinkle, Skinbooster, HA filler, Biostimulator filler, Biostimulator rejuvenation, Fat dissolve, Filler dissolve (Hylase), PRP/PRF); toggling rebuilds the editable body |
| Tick "Attach this treatment's medication details" | Latest treatment note's medications are appended |
| Click **Email · N categories** | Your **mail app opens** with a pre-filled draft to the patient; the app shows "Recorded on the patient file…" and an aftercare note lands in the Notes list |
| Try a patient with no email *(live only — see the differences table)* | Button disabled + "No email address on file for this patient…" |

**Fail if:** the app claims to have *sent* an email itself — sending always happens in your mail client.

### 1.6 Consent — in person
| Step | Expected |
|---|---|
| Patient file → **Sign a consent** | Template select, per-question Yes/No (with conditional detail fields), consent text with off-label clause highlighted, signature pad |
| Try to submit with an unanswered question or no signature | **Record signed consent** stays disabled |
| Complete and sign | Form appears in the file's Consent list; opening it shows responses + the signature image |
| In the form viewer, **Download PDF** | Demo: disabled with "available in live mode". (Live: downloads.) |
| **Delete (signed in error)** | Two-step confirm, then the form is gone |

### 1.7 Consent — remote link
| Step | Expected |
|---|---|
| Patient file → **Send a link** | Template select → **Generate signing link** produces a URL + QR + **Copy** button; demo shows a "Demo link" banner |
| **Email to {patient email}** | Opens the mail app with the link in the body |
| Double-click Generate | Only one link minted (double-tap guard); **Generate another** creates a fresh one |

---

## Part 2 — Nurse: authorisation lifecycle ★ (Sarah, then Dr Voss)

### 2.1 Raise a request ★
| Step | Expected |
|---|---|
| Patient file → **Raise authorisation request** | Product picker with search, Recently used chips, category chips (neurotoxin, HA filler, skin booster, collagen stimulator, PRP/PRF), brand drill-down, and an "Other / compounded" free-text line |
| Add a line | Editor for dosage, unit, **route** (never pre-selected — you must choose), treatment-area chips, optional timing |
| Try to submit with a line missing its route | Blocked until name + dosage + route are set on every line |
| Prescribing doctor select | Offers only cooperating doctors (Dr Voss in the seed) |
| Submit | Request shows under **Open requests** on the patient file with status Pending, and actions **Edit / Start consult / Withdraw** |

### 2.2 Edit / withdraw
| Step | Expected |
|---|---|
| **Edit** the pending request | Items editable; doctor picker **locked** ("The addressed doctor can't change while editing."); **Save changes** keeps it Pending |
| **Withdraw** (on a second throwaway request) | Status becomes Withdrawn; it leaves the doctor's inbox |

### 2.3 Doctor review ★ (sign out → **Dr Elena Voss**)
| Step | Expected |
|---|---|
| Dashboard | "Requests awaiting your review" tile; Upcoming authorisation calls section (doctor only) |
| Open Authorisations | Sarah's request: patient card (name links to the file, alert + allergies visible), item list, and **Approve / Require edit / Start consult** — there is **no flat reject** |
| **Require edit** with a comment | Request leaves the pending inbox |
| (As Sarah) **Edit & resubmit** → (as Voss) re-review | **Live only** — the demo reseeds on the account switch, so the Needs-edit state never reaches Sarah's session |
| (As Voss) **Approve** | Per-medication authorisations issued — 5 repeats, 6-month expiry — visible under the patient's **Active authorisations** |

### 2.4 Clause 68C Direction document ★
| Step | Expected |
|---|---|
| On the patient file, click **Direction** on an active authorisation | Capture step prefilled from the approval stamp: prescriber phone, principal place of practice, premises of administration, number & intervals, period; "Patient reviewed" is shown but not editable |
| Blank a required field | Marked **Needed**; **Preview** blocked with "Still needed: …" |
| Fill everything → **Preview direction** | Full document preview (patient, prescriber, premises, administrations, attestation) → **Download direction (PDF)** produces the PDF |
| A clinic-context authorisation (repeat as Ruby/Ava on a clinic patient) | Premises of administration is **always the clinic's fixed address** (2 Notts Ave, Bondi Beach) |

**Fail if:** any party name falls back to a raw uid, or the premises field on a clinic authorisation offers the nurse's personal premise.

### 2.5 Consult call (demo)
| Step | Expected |
|---|---|
| As Sarah, **Start consult** on an open request | Call overlay opens, labelled **simulated** ("Demo mode — live video connects on the live backend.") |
| End the call as the doctor (as Voss, start from the inbox) | Doctor sees the request panel beside the video with inline Approve/Require edit, then a wrap-up step (decision + post-call note) |

---

## Part 3 — Calendar, availability & bookings (as Sarah, then Voss)

### 3.1 Calendar views ★
| Step | Expected |
|---|---|
| Open Calendar | Day/Week/Month toggle; ‹ / **Today** / › stepping; **New appointment** button; pending-bookings inbox on top when requests exist |
| Day & week timelines | Seeded busy bands (external calendar) and blocked-time bands render behind appointments |

### 3.2 Create, drag, resize
| Step | Expected |
|---|---|
| Tap empty space on the day view | "Add at HH:MM" chooser: **New appointment / Block time / Cancel** |
| New appointment: search a patient, set time + duration | Appears on the grid |
| Toggle **New patient (no file yet)** instead | Lead fields (name, phone…) replace the search; the appointment shows the lead name |
| Drag an appointment to a new time; resize by its edges | Snaps to 5 minutes; can't shrink below 15 minutes |
| Create at a time outside treatment hours / on a block | Error: "That time is outside your treatment hours or on a blocked time." |

### 3.3 Appointment detail & lifecycle
| Step | Expected |
|---|---|
| Open an appointment | Modal (Escape/scrim closes); patient name links to the file |
| **Reschedule** | Time + duration editor, applies |
| **Complete** / **No-show** | Owner only; status colour changes on the grid |
| **Cancel** | Two-step ("Cancel this appointment?" → **Cancel appointment**) |
| A lead appointment → detail | **Create patient from lead** creates a file; if a matching return patient exists, **Use this file** is offered |

### 3.4 Check-out → client invoice ★ (demo)
| Step | Expected |
|---|---|
| Open a past/completed appointment with a real patient → **Check out** | `ClientInvoiceComposer` opens inline: free-text lines + price, **Charge GST** and **Prices include GST** toggles, live preview |
| **Issue invoice** | "Invoice issued — $X" + **Email invoice / Download PDF**; invoice also appears in the patient file's client-invoice list and the appointment gets an **Invoiced** chip in history |

### 3.5 Follow-ups & reminders
| Step | Expected |
|---|---|
| Follow-up reminders card | Default interval (2wk/2mo/4mo/6mo/Custom) + per-category overrides in a collapsible; **Follow-ups due** rows have **Done / Ignore** |
| Appointment reminders card | None / 1 day / 2 days before |

### 3.6 Availability — Treatment tab
| Step | Expected |
|---|---|
| Weekly schedule | Per-weekday Open checkbox + open/close times; "Open time must be before close time" on an inverted range |
| Blocked times | Add a block → it renders on the calendar; **Remove** clears it |
| External calendar card | Demo: no **Link** button, "Sync now" reports the seeded busy count; footer shows "N synced busy times · zone …" |

### 3.7 Availability — Authorisation tab ★
| Step | Expected |
|---|---|
| As **Voss**: **Always accept authorisation requests** switch | Persists across navigation ("Stays on across sessions until you switch it off"); there is **no** "I'm online now" switch (removed 20/07) |
| As Voss: **Publish a window** (date/start/end) | Appears under Your windows with "N open · N booked · N slots"; **Withdraw** works on an unbooked window; a booked window refuses ("has bookings and can't be withdrawn") |
| As **Sarah**: Book a consult | Doctor select (cooperating doctors only), date → **Open slots** chips → book for an existing patient or via **New patient (no file yet)** lead fields |
| Ad-hoc consult (doctor has always-accept on) *(live only — see the differences table)* | **Now / Pick a time** radios; past time refused; booking lands on both calendars. On the day grid a 10-min teleconsult renders as a thin unlabeled band — zoom/hover to confirm rather than assuming it's missing |
| Book the same slot twice (second tab / second account) | Second attempt fails with the slot-taken error, not a silent double-book |

### 3.8 Bookings tab
| Step | Expected |
|---|---|
| Open Bookings | **Your booking link** (auto-minted) + **Copy** + QR; demo banner "Demo link — in live mode the server resolves this token…"; pointer that approvals happen on the calendar |
| Pending booking requests (calendar top) | Each row: patient details + message, **Approve / Reschedule (with Apply) / Decline** |

---

## Part 4 — Invoicing & money (nurse + doctor)

### 4.1 Invoice tab — doctor ★ (as Voss)
| Step | Expected |
|---|---|
| Open Invoice | "Total approved requests" tile; **This month** rows per counterparty expanding to date — patient — items; historical months with **Generate invoice** |
| **Generate invoice** for a counterparty | Panel: per-script checkboxes + Select all/none, "Price per script (AUD)" with **Save price**, preview table (Description/Qty/Unit/GST/Total, Subtotal, GST (10%), Total) |
| Generate | Invoice appears in the **Invoices** list with an Unpaid chip and the ABN caption |
| **Mark paid** | Chip flips to Paid |
| **Email invoice** | Opens share sheet with the PDF attached (or downloads + opens mail with an "attach the downloaded file" note) — the row states which address it goes to |
| **Delete** an invoice | Two-step confirm; "Its authorisations return to un-invoiced" — the scripts reappear as generatable |
| **Custom timeframe** From/To → **Compute** | Totals for the range |

### 4.2 Invoice PDF sanity ★
Open any generated invoice PDF and check:
- Seller block: name, **address**, ABN. Buyer block: name + ABN where the counterparty has one.
- GST-inclusive presentation for client (B2C) invoices; GST-exclusive for service/B2B invoices.
- The GST label carries **no Chinese gloss**.

### 4.3 Service invoice — nurse invoices the clinic ★ (as Ruby Walsh, or Nadia after an Employment grant)
| Step | Expected |
|---|---|
| Open Invoice as a clinic-employed nurse | **Invoice the clinic** composer: "Billed to Lumière Clinic", free-text lines with "Amount ex GST", subtotal/GST/total preview |
| **Issue invoice** | "Service invoice issued — it appears under Service fees below." |
| As **Ava Lim** → Invoice | **Live only** — in demo the reseed on account switch discards Ruby's invoice; live, it shows under **Received service fees** (read-only + PDF/email) |
| As an independent-only nurse with no clinic identity (fresh Nadia) | The composer does **not** render |

### 4.4 Wallet & matrix streams (demo-only)
| Step | Expected |
|---|---|
| Patient file → Account section | Balance card with silo chip; **Top up** (owner silo only) and **Checkout** |
| Top up with paid + gift amounts | Gift chip renders gold; invoice issued; wallet history updated; a typo'd amount errors rather than becoming $0 |
| Checkout using "Pay from account balance" | Balance decreases; GST-inclusive preview |
| Invoice tab → Client invoices / Service fees streams | Kind chips (Client sale / Top-up), **Mark paid**; drafted service fees sit under "Awaiting your review" until **Finalize & send** |

### 4.5 Isolation guard
| Step | Expected |
|---|---|
| As Sarah-independent, open a Lumière clinic patient's file | Either no access, or the **reduced file** ("Clinic client — commercial access only": name + billing sections, **no** notes/demographics/authorisations) — never the full clinical file across silo lines |

---

## Part 5 — Clinic admin (as **Ava Lim**)

| Step | Expected |
|---|---|
| Patients | Clinic-owned list; can create/edit patients |
| A clinic patient file | Can write **general** notes and send forms; **no Treatment note button** (clinicAdmin is non-clinical); all note kinds visible |
| **Merge a duplicate** (Manage card) | Select a duplicate → merge moves notes & authorisations and removes the duplicate — clinicAdmin-only power |
| Send aftercare | Works (clinicAdmin may send aftercare) |
| Authorisations tab | Static "Admins don't raise authorisation requests…" message — no inbox, no request builder |
| Invoice tab → **Clinic statistics** | From/To + tiles (Authorisations, Patients served, Repeats used) — present **only** for clinic admin |
| Delete a clinic patient | Allowed (with confirm) |

---

## Part 6 — Platform admin (as **Priya Nair**) ★

### 6.1 Admin home & shell
| Step | Expected |
|---|---|
| Land after sign-in | `/app/admin` — never the clinical dashboard |
| Admin page | Two cards ("Patient records — audit access", "Audit log") + the console |

### 6.2 Accounts (demo)
| Step | Expected |
|---|---|
| Accounts list | The demo cast, every row a **Read-only** chip; **Create user · assign roles** disabled with "Sign in live as a super admin…" |
| Business entity line per account | Entity (type, legal/trading name, ABN, active) with **Edit** / **Deactivate**, or "No business entity…" + **Add business entity** |
| Add an entity with a 9-digit ABN | Refused — ABN must be 11 digits |

### 6.3 Relationships — Prescribing view
| Step | Expected |
|---|---|
| Open Relationships (Prescribing) | Grouped by doctor: Dr Voss with cooperating nurses; clinics appear only with the Prescriber kind |
| A relationship row | Active chip, kind chips (Employee/Prescriber), checkboxes (Active / Requests allowed / Invoicing), price override with **Save** appearing only when dirty, **Show history**, **Remove** (two-step deactivate) |
| Untick **Requests allowed** on Voss↔Sarah, then as Sarah open the request builder | Voss no longer offered ("No cooperating doctors yet — ask your platform admin to add one.") |
| **Add cooperation relationship** for an already-linked pair | Refused: "…already have a relationship (currently removed) — edit it in the list above." |

### 6.4 Relationships — Employment view ★
| Step | Expected |
|---|---|
| Switch to **Employment** | One card: Lumière Clinic. Rows: Dr Voss (if employee-kind), Ava Lim **Member account**, Ruby & Sarah **Member account** (read-only), **Nadia Okafor with a red Remove** |
| **Remove** Nadia → Confirm | She leaves the list; **Add employee** picker now offers Nadia |
| **Add employee** → Nadia → Add | She's back with a Remove button |
| Sign out → enter as **Nadia**: Practise-as shows a Lumière identity + the service-invoice composer | **Live only** — the demo reseeds on the switch, so the grant is gone by the time Nadia signs in. (Verified live 26/07: grant and revoke both propagate without re-login.) In demo, Nadia's *seeded* grant already provides the identity + composer — verify those directly |

**Fail if:** Ruby or Sarah ever gets a Remove button, or removing Nadia doesn't strip her Lumière identity on next entry.

### 6.5 Products
| Step | Expected |
|---|---|
| Products tab | Catalog grouped by category with counts; **Deactivate** strikes a product through + "· inactive" |
| **Add product** (category, unit, brand, name) | Appears in its category. Then as **Sarah** in the request builder: the new product is offered; the deactivated one is gone |

### 6.6 Patient lookup & audit ★
| Step | Expected |
|---|---|
| Patient lookup | Search-only — **no rows until you type** (deliberately not browsable) |
| Open a patient file from a result | Banner "Audit access — recorded"; the file is **read-only** (no note composer, no edit/delete, but all notes visible) |
| Audit tab | Newest-first log; the just-performed actions appear: **Patient file access**, Clinic employment granted/revoked, plus request/approval/invoice actions from earlier parts, each with actor + summary + time |

---

## Part 7 — Profile & templates (any clinical role)

| Step | Expected |
|---|---|
| Profile header | Tap avatar to change it (demo: instant) |
| Details card | AHPRA (clinical accounts), ABN display-only, Phone; **Principal place of practice** (doctor accounts); Address hidden for nurse accounts (their address is the active premise) |
| Blank the Phone and save (as Voss) | Save **refused** with an explanation naming the field ("directions from your approvals would be blocked…") — not a silently disabled button |
| Premises card (nurse) | Active premise leads; expand for radio list + Edit/Delete/**Add premise**; deleting the **last** premise is blocked; the selection here drives the dashboard "Working from" switcher and direction stamping |
| Templates tab | **New template** → name, body, aftercare-category chips → Save; **Edit**/**Delete** per row |
| Use the template | In a treatment note, "Apply a template…" prefills the body (still editable); template's aftercare categories preselect in the aftercare form |
| Doctor only | "Approvals & invoices" link → Invoice tab |
| No self-deletion | Profile has **no** delete-account control (admin-only act) |

---

## Part 8 — Live-mode spot checks (real account required)

Run after any deploy; these cover what the demo cannot.

| # | Check | Expected |
|---|---|---|
| L1 ★ | Sign in at `/login` with a real account | Lands per role; **Remember me** prefills email (never password) on return |
| L2 | New user created by an admin signs in | **Set your password** gate with policy chips (8+ / upper / number / symbol); after setting, normal app |
| L3 ★ | Admin console (live) | Real account list; **Create user** (Practitioner/Clinic toggle, roles, premises, supervising doctor); **Reset password** state cycle; **Delete** hidden on your own row |
| L4 | Grant/revoke propagation | Admin toggles an Employee kind or clinic employment → the affected signed-in user's identity list updates within seconds (claims watcher), no manual sign-out needed. *Nurse↔clinic employment writes fail until the `setClinicMembership` callable ships — see the 2026-07-25 QA plan.* |
| L5 | Approve a request live | Server generates the audit entry + approval-PDF treatment note; no duplicate client-side copies |
| L6 | Signed consent form | Signature uploads to Storage; PDF becomes downloadable (poll with **Check again**) |
| L7 | Remote consent link | Tokenised link opens for the patient once; signing lands the form in the file |
| L8 ★ | Aftercare + invoice email hand-offs | Mail app opens with the right recipient; invoice share sheet carries the PDF |
| L9 | Google Calendar | **Link Google Calendar** OAuth completes (popup-blocked fallback link works); events mirror both ways; no duplicates over a 2-week span |
| L10 | Consult call | Real ring on the callee ("Incoming consult" banner), two-way video, wrap-up saves |
| L11 | Client invoicing absence | Nurse Invoice tab shows "Client invoicing isn't available in live mode yet…" instead of the client list; wallet/Account sections absent — **by design** |
| L12 | Audit log durability | Actions from a previous session still listed |

---

## Reporting

For each failure record: **scenario # · account/identity · mode (demo/live) · steps · expected vs actual · screenshot**.

Severity guide:
- **P0** — data loss, cross-silo patient data leak, wrong party/premises on a legal document (direction/invoice), auth bypass of role routing.
- **P1** — a core flow blocked (can't request/approve/invoice/book), grant/revoke not taking effect.
- **P2** — wrong copy, layout, or a demo/live difference not listed in the table above.
