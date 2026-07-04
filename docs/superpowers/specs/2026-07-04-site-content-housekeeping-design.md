# Site-content housekeeping — design

**Date:** 2026-07-04 · **Source:** the open TODO placeholders tracked since the site shipped
(`site.ts`, `layout.tsx`, `SiteFooter.tsx`, "real app screenshots").

## Problem

Four content gaps have been carried as TODOs: dead `#` Privacy/Terms footer links with no
pages behind them, and no real product imagery anywhere on the marketing site (the hero is a
CSS mockup). Two further TODOs — the App Store URL and the production domain — plus the
contact email are **owner-supplied facts** that cannot be invented; they stay TODO.

## Change

- **`/privacy` + `/terms` pages** — server components in the site's editorial style (kicker,
  display heading, prose sections, `SiteNav`/`SiteFooter` chrome). Content drafted for an
  Australian aesthetic-medicine practice-software product: Privacy covers what the marketing
  site itself collects (essentially nothing — no analytics, no cookies today), what the app
  handles on behalf of practices (health information under the Privacy Act 1988 / APPs, the
  practice as the record controller), the interactive demo (in-memory, resets on reload) and
  live sign-in, data location/security, and contact. Terms covers acceptable use of the site
  and demo, no-medical-advice, IP, the app being governed by its own agreement, liability,
  and Australian governing law. **Both are drafts for legal review before real customers rely
  on them** — stated in the PR, not on the pages.
- **Footer** links Privacy/Terms to the new routes (removing the TODO `#` anchors).
- **Real app screenshots** — captured from the demo app itself (Porcelain & Ink UI, seeded
  Lumière Clinic data, demo-badge chrome hidden during capture) into `public/screenshots/`:
  calendar day view (doctor), patient file, and the doctor's review-requests queue. A new
  home-page **“See it in action”** section (between `KeyPoints` and `WhoForSection`) shows
  the three shots via `next/image` with descriptive captions/alt text, in the existing
  section style (kicker + display heading + `Reveal`). The web demo IS the product UI ported
  from iOS, so these are honest product screenshots.
- **Unchanged TODOs (need the owner):** App Store listing URL, production domain (+ OG URL),
  confirmation of the contact email.

## Out of scope

Analytics/cookie tooling (would change the privacy page), production domain metadata, App
Store badge/link, replacement OG image.
