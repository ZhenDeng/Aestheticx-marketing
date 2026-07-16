# UI design notes — 16/07 feedback surfaces

Aesthetic contract: AestheticX's existing warm clinical minimalism — ink (`--color-ink`) on card
white, hairline `--color-line` rules, gold `--color-tint` as the single accent, rose reserved for
destructive intent, `micro` uppercase kickers, `font-display` for headings, `rounded-card/inner/btn`
radii. Every new surface must read as if it always existed. No new primitives, no new colors.

## 1. Calendar cancel — inline confirmation (destructive two-step)

State machine inside `AppointmentActions`: `idle → confirmingCancel`.
- Idle: the existing rose-text "Cancel" ghost button, unchanged position (last in actions row).
- Confirming: the actions row is REPLACED by one line —
  `Cancel this appointment?` (text-sm, ink) + two buttons:
  - **Cancel appointment** — solid rose fill (`background: var(--color-rose)`, `text-card`),
    the only filled-rose button in the app: destructive commitment is visually louder than intent.
  - **Keep** — quiet `border border-line` ghost, ink-soft.
- Reset to idle when the detail closes or another appointment is selected (key by appt.id).
- The other action buttons disappear while confirming — one decision at a time.

## 2. Dashboard "Mark completed" on upcoming-call rows

Each `UpcomingAuthCalls` row: right block currently holds date/time. Add beneath it a quiet
ghost button (border-line, text-xs, ink-soft, hover:border-tint) — `Mark completed`.
- Non-destructive → no confirm step; in-flight label `Marking…` + disabled.
- On success the row leaves the list naturally (status flips to completed).
- Error: one rose text-xs line inside the section (shared `error` state), matching PremiseSwitcher.

## 3. Merged "Premises of administration" card (Profile, nurse role)

Selection-first hierarchy, three tiers:
1. **Header row**: `micro` kicker "PREMISES OF ADMINISTRATION"; beneath it, a full-width
   button showing the ACTIVE premise — name (text-sm font-medium ink) over address
   (text-sm ink-soft) — with a right chevron `▾/▸`. `aria-expanded` toggles the list.
   A tint left rail (2px inset border-l, `--color-tint`) marks it as the live selection.
2. **List (expanded)**: radio-style rows identical to the dashboard switcher (`●/○` in tint/line),
   `aria-pressed`; selecting closes nothing (list stays open, dot moves) — switching is the
   primary act. Per-row Edit/Delete stay as quiet text links right-aligned, ink-soft.
3. **Bottom action bar**: hairline top rule, then **Add premise** ghost button — management
   actions live at the bottom, per feedback. Default badge (tint-soft pill) and
   "Working here" (sage pill) carry over unchanged.
The free-text Address block disappears for nurse-role accounts; the card IS the address surface.
Caption under the kicker: "Your current place of practice — it prints on every authorisation."

## 4. Invoice generate panel — per-script checkboxes + live totals

Inside the existing `rounded-inner border border-line p-3` panel:
- Row list: one `<label>` per script — native checkbox restyled (`accent-color: var(--color-tint)`),
  then `{d/m/yyyy} — {patient}` text-sm ink, count-of-items caption if >1 item (text-xs ink-soft).
  Default all checked. Row hover: `bg-[--color-tint-soft]/40`.
- Header line above list: `{n} of {total} selected` (micro) + `Select all / none` text link.
- Totals strip re-computes from selection: `Subtotal … · GST … · Total …` — Total in
  font-medium ink; strip fades to ink-faint when 0 selected.
- **Generate invoice** tint-filled button: disabled (opacity-50) at 0 selected.

## 5. Invoice list — Delete with inline confirm

Per invoice row, after "Mark paid"/"Download PDF": quiet text-xs rose "Delete".
Click → the row's action cluster swaps to `Delete this invoice? Its authorisations return to
un-invoiced.` + **Delete invoice** (rose fill, text-xs) / **Keep** (ghost). Same two-step
grammar as the calendar cancel — one destructive idiom app-wide.

## 6. Tax-invoice PDF — bordered table (the corporate-grade fix)

A4, existing 56pt margins, single Helvetica-family writer; INK/GOLD/SOFT palette only.
- Header block unchanged in spirit: `TAX INVOICE` 23pt, seller + `ABN` line, To / Date issued /
  Invoice number fields.
- **Items table** (full content width, outer 1pt INK-soft frame, 0.5pt interior rules):
  - Columns: DESCRIPTION (flex ~55%), QTY (8%, right), UNIT (13%, right), GST (11%, right),
    AMOUNT (13%, right). Headers 8pt GOLD, charSpace 1, uppercase, on a header band bounded
    by heavier rules top+bottom.
  - Body rows 10pt INK description (wrapped within column), numerals right-aligned SOFT→INK
    (AMOUNT in INK, others SOFT). Row rule 0.5pt line after each row. Vertical separators
    between all columns, full table height.
  - Page overflow: close frame, new page, repeat header band.
- **Totals block**: right-aligned mini-table under the items table (no left frame), rows
  `Subtotal (excl. GST)` / `GST (10%)` SOFT, then a framed band `TOTAL AMOUNT PAYABLE`
  8pt GOLD kicker + 16pt INK amount. Rule-weight hierarchy carries the eye to the total.
- Footer: `The total price includes GST.` 10pt INK — the ATO statement, kept verbatim.
