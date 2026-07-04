# Google-calendar sync — web integration — plan

Design: `docs/superpowers/specs/2026-07-03-calendar-sync-web-design.md`
Branch: `feat/calendar-sync-web`

## Tasks

- [x] 1. `src/lib/demo/externalBusy.ts` (test-first): `ExternalBusyEvent`,
      `localPartsInZone` (Intl, DST-correct), `externalBusyForDate` (clamped to the day,
      transparent skipped) — ported from the backend's tested `calendarSync.ts`
- [x] 2. Model/hydrate: `externalBusyByOwner` on DemoState + seed (one mid-day event,
      one spanning midnight); `mapExternalBusy`; hydrate `externalBusy/{uid,clinics}`
- [x] 3. Calendar UI: muted non-interactive "Busy · external" blocks behind chips on the
      day + week timelines (display-only — manual booking may double-book per spec)
- [x] 4. Availability Treatment tab: External calendar card — live Link Google
      (authUrl → window.open) + Sync now (browser IANA zone; busyCount/mirrored status +
      rehydrate; iOS-wording failure message); demo simulation; Apple on-device note
- [x] 5. Verify: vitest (349) + tsc + `next build` green; browser-checked — the seeded band
      renders 12:30–13:30 on day AND week views with the "Busy · external calendar" label
      (the midnight-spanning dinner event is correctly clipped by the 07:00–19:00 display
      window), demo Sync now reports "2 busy times, 0 mirrored" + the meta line, the Link
      button is live-only; no console errors; engineer review below. Review: Warning
      (no CRITICAL/HIGH) → fixed in 2387b21 (popup-blocker: window.open handle checked with
      a clickable consent-link fallback; empty authUrl → explicit error; BusyBlocks bands
      useMemo'd; unused prop dropped) → re-review **Approve**, no new findings (one cosmetic
      note deliberately accepted: the fallback link stays visible after use — harmless)
- [x] 6. Docs/memory sync + PR — https://github.com/ZhenDeng/Aestheticx-marketing/pull/46
