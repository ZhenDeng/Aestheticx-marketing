# QA run results — full post-login regression (demo + live)

**Plan:** [2026-07-26-post-login-full-manual-qa.md](./2026-07-26-post-login-full-manual-qa.md)
**Run:** 2026-07-26, automated with headless Playwright. Demo parts against the local `web-demo` dev server (port 3001, commit `b808079`); **Part 8 against production** (www.aestheticxgroup.com) using owner-provided accounts — the owner signed in interactively per account; sessions were then driven headlessly from saved browser profiles.
**Coverage:** Parts 0–7 in full, plus Part 8 live (see the Live section at the end).

## Verdict

**~150 checks executed across all seven demo parts — no P0/P1 defects found.** Every core flow works: login/guards/identity switching, patient CRUD + search, notes/aftercare/consent (in-person + remote), the full authorisation lifecycle (request → review → approve → Clause 68C direction PDF), calendar + availability + bookings, all four invoicing surfaces, the wallet, clinic-admin powers, and the whole admin console. Role gating and silo isolation held everywhere they were probed.

Two low-severity app findings, two UX observations, and four **test-plan amendments** (scenarios that cannot run in demo as written) came out of the run.

---

## Findings (app)

### F1 — P2: Patient search doesn't match the displayed preferred name
The patient list renders `Claire 'Coco' Donovan` (`displayName`), but name search matches `fullName` = given + last only ([backend.ts:346](../../src/lib/demo/backend.ts) → `fullName`). Typing the on-screen nickname **"Coco" returns no rows**, which reads as a missing patient.
*Repro:* Patients → search `Coco` → empty. Search `Claire` → found.
*Suggested fix:* match against `displayName` (or given/preferred/last individually).

### F2 — P3: Phone search is exact-full-number only
`searchPatients` compares the full digit string for equality, so a fragment (`0432 901`) returns nothing; only the complete number matches. May be an intentional iOS-parity choice, but it differs from how the name search (substring) behaves and the search placeholder doesn't say the full number is required.

### O1 — UX: 10-minute teleconsults are illegible on the calendar grid
A booked auth teleconsult (10 min) renders as a ~6-px unlabeled sliver on the day timeline — verified present via screenshot, but there is no readable label at default zoom. Easy to mistake for a rendering artifact or to miss entirely.

### O2 — Info: invoice-row ABN caption absent in demo
The plan's 4.1 expects an "ABN caption" on invoice rows. In demo no counterparty has a business-entity ABN, so no caption renders — confirmed **by design** (the row shows the caption only when the invoice snapshot carries `party.abn`; [billing/page.tsx:173](../../src/app/app/billing/page.tsx)). Check this in live with an entity-holding counterparty.

---

## Test-plan amendments (demo limitations discovered, not app bugs)

1. **Demo data resets on any account switch, not just reload.** The store lives in the `/app` layout provider; signing out unmounts it and re-entry reseeds. Every cross-account round-trip in the plan (2.3 require-edit → nurse resubmit → re-review, 4.3 Ava receiving Ruby's service fee, 6.4 "sign out → enter as Nadia") is **live-only**; in demo each account is tested against seeded state. Verified empirically (a created patient vanishes across switch).
2. **URL-paste guard tests (0.2/0.3) must use the `?next=` round-trip** — pasting an `/app/...` URL performs a full load, which resets the sandbox to `/demo?next=…` before the role guard is observable. The guard itself works: `next=/app/admin` as a nurse lands on the dashboard; `next=/app/calendar` as admin lands on `/app/admin`.
3. **The no-email aftercare guard (1.5) is not constructible in demo** — email is a required field on the patient form and every seeded patient has one. Live-only.
4. **The ad-hoc consult panel (3.7) is untestable in demo** — it needs a doctor's always-accept flag ON while a nurse session is active, and the flag resets on the account switch.

The plan doc should get a small follow-up edit folding these into its "known demo/live differences" table.

---

## Part-by-part summary

| Part | Result | Notes |
|---|---|---|
| 0 — Login, guards & session | **17/17** | Picker, `?next=` round-trip, role route separation both directions, exact nav sets, identity switch changes tint/lists, sign-out. |
| 1 — Nurse clinical records | **pass** (F1, F2 logged) | Dashboard tiles + premise switcher, search (name/DOB/phone), create/edit/delete with required-field gating, patient file sections, general note, aftercare (8 categories, `mailto:` to the patient, recorded-on-file note), remote consent link (demo banner, QR, single-mint guard), in-person consent (gating: answers AND signature; viewer; PDF disabled in demo; delete w/ confirm). |
| 2 — Authorisation lifecycle | **pass** | Builder (route never pre-chosen; name+dosage+route+doctor gate; cooperating-doctor-only select), edit (doctor locked) + withdraw, doctor inbox (no flat reject), require-edit, approve (5 repeats/6-mo; "Treatment authorisation —" note generated), Direction dialog: clinic premise correctly stamped **"Lumière Clinic, 2 Notts Ave, Bondi Beach"**, Needed-field gate, full preview, PDF downloads, no raw uids, sign-off footer. Simulated consult overlay + wrap-up verified. |
| 3 — Calendar, availability, bookings | **pass** (O1 logged) | Views, pending-booking Approve/Reschedule/Decline, follow-ups due + reminder settings (day view), google-source line, lead → patient conversion, reschedule/complete/no-show/two-step cancel, outside-hours guard, block time, check-out → client invoice → **Invoiced chip** in history (screenshot-verified), always-accept persistence, publish/withdraw windows, demo external-calendar copy + Sync now, weekly schedule validation, booking link + QR, slot booking consumes the slot (6→5). |
| 4 — Invoicing & money | **pass** (O2 logged) | Doctor tiles/drilldown/generate panel (select all/none, price save, GST table) → Unpaid → Mark paid → Paid, PDF download, delete returns scripts to un-invoiced, custom timeframe; Ruby's clinic service invoice ($800 → GST preview → Service fees stream); wallet: seeded $2,500+$500 gift, typo'd amount **blocks** the top-up (disabled, not $0), $100 top-up lands ($3,100), checkout panel (price list, pay-from-balance), matrix streams with Top-up chip; silo isolation (clinic patient invisible to the independent identity). |
| 5 — Clinic admin | **16/16** | Clinic list, create patient, **no Treatment-note button**, general notes + aftercare + consent allowed, all note kinds visible, **merge duplicate works** (dup removed), static authorisations message, clinic statistics (admin-only), delete offered. |
| 6 — Platform admin | **pass** | Admin home cards, read-only demo cast + disabled Create user, entity ABN 11-digit validation, prescribing view (kind chips, toggles, history, duplicate-pair guard message), employment view (Nadia removable / Ruby-Sarah-Ava read-only chips / remove→confirm→re-add round-trip), products add + deactivate/activate, patient lookup (search-only, audit banner, read-only file), audit log records **Patient file access** + employment grant/revoke with actor. |
| 7 — Profile & templates | **pass** | Doctor fields (AHPRA/ABN/principal place), blank-phone save **refused** with named field + consequence, nurse premises card (expand, add, delete; last premise's Delete disabled = the guard), templates CRUD + "Apply a template…" prefill into a treatment note, admin profile links, no self-delete anywhere. |
| 8 — Live spot checks | **not run** | Needs a real production account; includes the `setClinicMembership` write (backend #118) smoke that memory notes as still pending. |

---

## Part 8 — Live (production) results

Accounts used: super admin `zhexia.shah.wang@gmail.com`, doctor `doctor@doctor.com` ("Dr Demo" — holds super admin + doctor + nurse roles, so it lands in the admin shell and must switch to "Independent clinician · Doctor" for clinical work), nurse `jxyctl@gmail.com` ("Zhen"), clinic admin `zhexiawang@outlook.com` ("Internal Clinic"). All writes were scoped to QA objects (a "QA Test — Delete Me" patient, the Internal Clinic ↔ Zhen employment round-trip, a Dr Demo ↔ Zhen cooperation link) and were reverted. Real users visible in the console (Danni Wang, Dr Jenn Lee, Yinghua Xu) were not touched — including NOT sending any request to Dr Jenn Lee, Zhen's pre-existing cooperating doctor.

| # | Check | Result |
|---|---|---|
| L1 | All four sessions restore; Live chip; correct role shells/nav | **PASS** (4/4 accounts) |
| L3 | Live console: real accounts list, Create user enabled, entity edit surface; create-user form fields verified (Practitioner/Clinic toggle, roles, temp password) — **form opened and cancelled only**: account creation + temp-password entry is credential handling the agent must not perform; run L2/L3-create manually | **PASS (bounded)** |
| L4 | **`setClinicMembership` smoke — the pending item from 25/07**: grant Zhen → Internal Clinic landed via the live callable; nurse gained "Zhen @ Internal Clinic · Employee · Nurse" in Practise-as **without re-login** (claims watcher); "Invoice the clinic" composer appeared; **revoke** removed her cleanly (the 26/07 grant-record fix holds), identity disappeared, composer gone | **PASS** — grant + revoke, both directions propagated |
| L5 | Full live approval loop on the QA patient: request → Dr Demo inbox → Approve → active authorisation + **server-generated "Treatment authorisation — 26 Jul 2026" note** + audit entries (`REQUEST CREATED`, `APPROVED … emergency: adrenaline`) | **PASS** |
| L5+ | Clause 68C Direction capture opened from the live approval **fully prefilled** (prescriber stamp intact) | **PASS** |
| L6 | In-person consent: signature uploaded to Storage, image renders back, **server PDF pipeline** went Preparing → ready via "Check again" polling | **PASS** |
| L7 | Remote consent link: real tokenised single-use URL (`…web.app/s/<uuid>`), QR, no demo banner, mailto hand-off to the patient address | **PASS** |
| L8 | Aftercare: `mailto:` draft addressed to the patient with the aftercare body; "Recorded on the patient file" note written live | **PASS** |
| L10 | Consult call between two live sessions: nurse's overlay went live ("Starting…", video + PiP — not simulated), **doctor received the INCOMING CONSULT ring** via `consultSignals`, Decline consumed it | **PASS** |
| L11 | Nurse Invoice tab shows "Client invoicing isn't available in live mode yet…"; no wallet/matrix streams | **PASS** (by-design gap confirmed) |
| L12 | Audit log durable across sessions; `CLINIC EMPLOYMENT GRANTED` / `REVOKED` and approval entries all recorded | **PASS** |
| L2 | First-login password gate | **NOT RUN** — requires creating a user and signing in with its temp password (credential handling); do manually: super admin → Create user → sign in as that user → expect the "Set your password" gate |
| L9 | Google Calendar OAuth + two-way sync | **NOT RUN** — needs interactive Google consent on the doctor account; the availability card rendered correctly |

**Live cleanup state:** QA patient deleted; employment grant revoked; Dr Demo ↔ Zhen cooperation deactivated (the record remains inactive in the list — reactivate via its row if ever wanted); second QA request withdrawn, first consumed by the approval. Append-only remains: audit entries from the run, and the approved-authorisation/consent records went away with the patient file's deletion from the app's view.

**No live defects found.** One operational observation: `doctor@doctor.com` defaults to its Platform identity (lands on `/app/admin`) because it holds super admin + doctor + nurse — expected behavior for a multi-role account, but worth knowing when using it for doctor-side testing.

## Environment notes
- Headless-automation artifacts, not app issues: clipboard "Copied" feedback needs clipboard permission (granted mid-run); two visual states (Invoiced chip, teleconsult band) were confirmed by screenshot where text extraction missed them.
- Run scripts + failure screenshots live in the session scratchpad (`qa/part*.mjs`, `qa/shots/`), reusable as a regression harness if wanted.
