# Follow-up interval presets + per-treatment intervals — Design

**Goal (Tier 3, item #2):** replace the clinician's single free 1–90-day follow-up interval with **named presets** (2 weeks / 2 months / 4 months / 6 months / custom) and add an optional **per-treatment override** so a follow-up can be scheduled at a different interval depending on the treatment.

## Context / current state
`FollowUpSettings = { enabled, intervalDays }` on `users/{uid}` (client-written; the users rule is a blocklist that already permits new follow-up fields — no rules change). A follow-up task is created **client-side on treatment-note save** (`saveTreatmentNote`, web + iOS; no Cloud Function), due `now + intervalDays`.

## Decisions
1. **Reshaped model** (`types.ts`): `preset: '2wk'|'2mo'|'4mo'|'6mo'|'custom'` + `customDays?` (custom only, clamped 1–90) + `perTreatment?: Partial<Record<ProductCategory, NamedPreset>>` + **`intervalDays` kept** as a derived mirror of the *global* preset. Preset→days: 14 / 60 / 120 / 180.
2. **Per-treatment keys on `ProductCategory`** — the only treatment signal available at follow-up-task-creation time is the category of the **consumed authorisations** (`MedicationItem.category`). There is no first-class "treatment type" field. A note can be saved with **no ticked authorisation** → falls back to the global preset. When a note spans **multiple categories**, the **shortest** interval applies (patient seen at the earliest relevant follow-up). Resolver: `followUpIntervalForCategories(settings, categories)`.
3. **Back-compat / migration.** `intervalDays` is dual-written (= global preset days) so the current iOS build and any un-migrated reader keep working. Hydrate `readFollowUpSettings` decodes the new fields, and **migrates a legacy `followUpIntervalDays`-only doc** to a preset (exact preset-day match → that preset, else `custom`). No batch migration — read-time only.
4. **iOS parity = fast-follow.** Web and iOS write the same `users/{uid}` doc; the derived `followUpIntervalDays` keeps the current iOS binary correct until iOS is updated (same reshape in `FollowUp.swift` + both backends + `FollowUpViews` + tests).

## Layers (web)
- `types.ts`: `FollowUpNamedPreset`/`FollowUpPreset`/reshaped `FollowUpSettings`.
- `backend.ts`: `FOLLOW_UP_PRESET_DAYS`, `presetDays`, `followUpIntervalForCategories`, `readFollowUpSettings` (migration decode); `followUpSettingsForUser` default `{enabled:false, preset:'2wk', intervalDays:14}`; `setFollowUpSettings` normalises `intervalDays`; `saveTreatmentNote` derives categories from `tickedIDs` and uses the resolver.
- `mirror.ts`: write `followUpPreset`/`followUpCustomDays`/`followUpPerTreatment` + `followUpIntervalDays`.
- `hydrate.ts`: `readFollowUpSettings(d)`.
- `calendar/page.tsx`: preset `<select>` + conditional custom-day input + a collapsible per-category override list.

## Testing
Pure: `presetDays`, `followUpIntervalForCategories` (override / global fallback / shortest-across-categories), `readFollowUpSettings` (new-doc decode incl. junk per-treatment keys, legacy migration, null). Integration: `saveTreatmentNote` schedules at the global preset (no tick) and at the per-treatment interval keyed on a consumed auth's category.

## Out of scope
- iOS parity (fast-follow). Backend/rules (none needed). A first-class note-level "treatment type" field (deliberately not introduced — per-treatment keys on the consumed-auth category).
