# Google-calendar sync — web integration — plan

Design: `docs/superpowers/specs/2026-07-03-calendar-sync-web-design.md`
Branch: `feat/calendar-sync-web`

## Tasks

- [ ] 1. `src/lib/demo/externalBusy.ts` (test-first): `ExternalBusyEvent`,
      `localPartsInZone` (Intl, DST-correct), `externalBusyForDate` (clamped to the day,
      transparent skipped) — ported from the backend's tested `calendarSync.ts`
- [ ] 2. Model/hydrate: `externalBusyByOwner` on DemoState + seed (one mid-morning event,
      one spanning midnight); `mapExternalBusy`; hydrate `externalBusy/{uid,clinics}`
- [ ] 3. Calendar UI: muted non-interactive "Busy · external" blocks behind chips on the
      day + week timelines (display-only — manual booking may double-book per spec)
- [ ] 4. Availability Treatment tab: External calendar card — live Link Google
      (authUrl → window.open) + Sync now (browser IANA zone; busyCount/mirrored status +
      rehydrate; iOS-wording failure message); demo simulation; Apple on-device note
- [ ] 5. Verify: vitest + tsc + build; browser check (busy blocks in day/week, card states,
      demo sync); engineer review loop
- [ ] 6. Docs/memory sync + PR
