# Site-content housekeeping — plan

Design: `docs/superpowers/specs/2026-07-04-site-content-housekeeping-design.md`
Branch: `feat/site-content-housekeeping`

## Tasks

- [x] 1. `/privacy` + `/terms` pages (editorial style, metadata, canonical) + footer links
- [x] 2. Capture demo-app screenshots (calendar day, patient file, review requests) into
      `public/screenshots/` with demo chrome hidden (puppeteer-core driving installed
      Chrome headless; 2× DPR 1440×880; script kept in the session scratchpad)
- [x] 3. "See it in action" home section (next/image, captions, Reveal) between KeyPoints
      and WhoForSection
- [x] 4. Verify: vitest (349) + tsc + `next build` green (/privacy + /terms prerendered);
      browser-checked: both pages render all sections, footer links resolve, showcase
      images load through the Next image optimizer; no console errors from these pages
- [ ] 5. Engineer review; fix findings
- [ ] 6. Docs/memory sync + PR (list the owner-input TODOs that remain)
