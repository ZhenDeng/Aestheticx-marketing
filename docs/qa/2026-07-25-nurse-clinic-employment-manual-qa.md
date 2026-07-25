# Manual QA plan — Nurse clinic employment + invoicing

**Feature:** a super admin employs a nurse at a clinic (grant/revoke); an employed nurse gets the clinic workspace and can invoice the clinic.
**Shipped:** web PR #162 (merged + deployed 2026-07-25). Backend `setClinicMembership` callable is a **pending follow-up** (PR #163 handoff) — see the Live-mode section for what is expected to fail until it ships.

---

## Before you start

### Where things live (read this first — it explains the most common false "bug")

- **Nurse↔clinic employment is NOT a cooperation relationship.** The **"Add cooperation relationship"** form links a **doctor** to a nurse or clinic (prescribing gate, price, invoicing flags). It intentionally offers no nurse↔clinic option.
- Nurse↔clinic employment lives in: **Admin → Relationships → "Employment" tab → the clinic's card → "Add employee"** picker at the bottom of the card.

### Environments

| Mode | How to reach it | What works |
|---|---|---|
| **Demo** | www.aestheticxgroup.com → Sign in → "Try the demo" (or local `web-demo` dev server) | Everything in this plan except the Live-mode section |
| **Live (production)** | Sign in with a real account | Everything except the **grant/revoke write** (fails until the backend callable ships) |

### Demo accounts (any password works)

| Account | Role | Relevance |
|---|---|---|
| Priya Nair | Platform admin | Performs all grants/revokes |
| **Nadia Okafor** | Nurse (independent) | **Grant-backed** Lumière employee — the removable example |
| Ruby Walsh | Nurse (@ Lumière) | Baked member — must stay **read-only** |
| Sarah Chen | Nurse (independent + @ Lumière) | Baked member — must stay **read-only** |
| Dr Elena Voss | Doctor | Employment view doctor row — must be unaffected |

### Demo-mode ground rules

- **The demo resets on any full page reload** (F5, address-bar navigation). Always navigate with the in-app links. If you refresh mid-scenario, start the scenario over.
- To switch accounts, use **Sign out** in the header, never the browser back button.

---

## Part A — Admin Employment view (demo, as Priya Nair)

Navigate: **Admin → scroll to Relationships → click "Employment"**.

### A1. Seeded state renders correctly
| Step | Expected |
|---|---|
| Open the Employment tab | One card: **Lumière Clinic** |
| Inspect the rows | Dr Elena Voss (doctor row with kind chips/price — unchanged), Ava Lim "Member account" pill, **Nadia Okafor with a red "Remove" button**, Ruby Walsh **"Member account"** (no Remove), Sarah Chen **"Member account"** (no Remove) |
| Bottom of the card | **"No nurses to add."** (every demo nurse is already a Lumière member) |

**Fail if:** Ruby or Sarah shows a Remove button; Nadia shows a "Member account" pill instead of Remove.

### A2. Remove a grant-backed employee (revoke)
| Step | Expected |
|---|---|
| Click **Remove** on Nadia's row | Inline confirm appears: "Remove from clinic?" with Confirm / Cancel |
| Click **Cancel** | Row returns to normal, Nadia still listed |
| Click **Remove → Confirm** | Nadia disappears from the staff list; the bottom of the card now shows an **"Add employee"** picker offering **Nadia Okafor** |

### A3. Add an employee (grant)
| Step | Expected |
|---|---|
| With Nadia in the picker, click **Add** | Nadia reappears in the staff list **with a Remove button**; picker returns to "No nurses to add." |
| Repeat A2 + A3 once more | Round-trip is stable, no duplicate rows, no errors |

### A4. Baked members are untouchable
| Step | Expected |
|---|---|
| After any amount of A2/A3 churn | Ruby and Sarah still show the read-only "Member account" pill — never a Remove button, never listed in the Add picker |

### A5. Cooperation form still excludes nurse↔clinic (by design)
| Step | Expected |
|---|---|
| Click **"Add cooperation relationship"** | The form offers a **Doctor** picker + a **Nurse / Clinic** counterparty toggle only. There is no way to select a nurse as the subject — **this is correct behavior, not a bug** |
| Switch to the **Prescribing** tab | Unchanged: Dr Voss → Sarah Chen nurse row with price/invoicing controls |

### A6. Audit log records the grant/revoke
| Step | Expected |
|---|---|
| Do one Remove and one Add on Nadia (A2/A3), then open **Audit** in the admin nav | Entries labelled **"Clinic employment revoked"** and **"Clinic employment granted"**, actor Priya Nair, naming Nadia + Lumière |

---

## Part B — The employed nurse's experience (demo)

### B1. Grant-backed nurse has the clinic workspace
| Step | Expected |
|---|---|
| Sign out, sign in as **Nadia Okafor** | Signs in normally |
| Open **Profile** | Identity switcher offers "Practise as" **Lumière Clinic** (nurse) in addition to independent |
| Switch to the Lumière identity | Patient list shows the **clinic's book** as the main list |

### B2. Employed nurse invoices the clinic
| Step | Expected |
|---|---|
| As Nadia (either identity), open **Invoice** | Section **"Invoice the clinic"** with **"Billed to Lumière Clinic"** |
| Enter description `QA test services`, amount `800`, click **Issue invoice** | "Service invoice issued — it appears under Service fees below." |
| Check the preview totals before issuing (optional) | Subtotal $800.00, **GST (10%) $80.00, Total $880.00** (GST-exclusive B2B math) |
| Scroll to **Service fees** | New line: Lumière **$880.00**, SERVICE FEE, Unpaid, with Email invoice / Download PDF |
| Click **Download PDF** | Tax invoice PDF downloads; issuer is Nadia, billed-to is the Lumière entity |

### B3. Validation
| Step | Expected |
|---|---|
| Click **Issue invoice** with an empty line | Inline error "Complete line 1 — a description and a positive amount." — nothing issued |
| Amount `0` or `-5` | Same inline error |

### B4. Revoked nurse loses everything
| Step | Expected |
|---|---|
| Sign out → Priya → Employment → **Remove Nadia (Confirm)** → sign out → sign in as **Nadia** | Profile no longer offers the Lumière identity; **Invoice** page no longer shows the "Invoice the clinic" section (no clinic to bill) |
| (Cleanup) Sign back in as Priya and re-add Nadia | Restores seeded state for the next tester |

### B5. Un-granted nurses are unaffected
| Step | Expected |
|---|---|
| Sign in as **Sarah Chen** | Her Lumière access is exactly as before this feature (baked identity): clinic identity present, composer shows Lumière. Nothing gained, nothing lost |

---

## Part C — Live mode (production, real accounts)

> **Known limitation until the backend `setClinicMembership` callable ships (PR #163 handoff):** the admin grant/revoke **write** fails in live mode. C1 documents the expected failure; C2–C4 apply **after** the backend deploys.

### C1. Current expected behavior (before backend ships)
| Step | Expected |
|---|---|
| As a real super admin: Admin → Relationships → Employment → Add employee → **Add** | The member row does **not** appear; a **sync-error banner** appears (callable not found). No partial state: reloading shows the nurse still un-employed |
| Everything read-only in the Employment view | Renders correctly from real `users` docs (members from claims), doctor rows unchanged |

**Fail if:** the write appears to succeed silently, or the UI shows the nurse as employed while the banner reports an error.

### C2. After backend deploys — grant propagates (requires a test nurse account)
| Step | Expected |
|---|---|
| Super admin adds test-nurse to a clinic | Row appears with Remove; no sync error |
| Test nurse (already signed in on another browser) waits ~a minute or reloads | Clinic identity appears in their switcher without re-login (claims self-heal) |
| Test nurse opens Invoice | "Invoice the clinic" shows the clinic; issuing a $10 line succeeds and the service-fee invoice persists across reload |

### C3. After backend deploys — revoke propagates
| Step | Expected |
|---|---|
| Super admin removes the test nurse | Row disappears; nurse's session drops the clinic identity (self-heal); composer no longer offers the clinic; no lockout of their independent workspace |

### C4. Live audit labels
| Step | Expected |
|---|---|
| Admin → Audit after C2/C3 | Entries read "Clinic employment granted/revoked" — **not** "Patient file access" (the allowlist fix in PR #162) |

---

## Part D — Regression spot-checks (demo, 5 minutes)

| Check | Expected |
|---|---|
| Doctor employee flow | Employment view: Dr Voss row still editable (kind chips, price, Remove); toggling Employee/Prescriber chips still works |
| Prescribing view | Unchanged grouping by doctor; nurse rows unaffected |
| Client checkout invoicing | As Sarah/Ruby, invoicing a client from their file still works (unrelated path) |
| Demo sign-in list | Six accounts, Nadia last; picking each signs in with the right shell |

---

## Reporting

For each failure, capture: **mode (demo/live) · account · exact click path · what you saw vs the Expected cell · screenshot**. Demo failures: note whether you had refreshed the page mid-scenario (a refresh resets all demo data and invalidates the scenario).
