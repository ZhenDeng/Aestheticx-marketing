# AestheticX — Marketing Site

Promotional landing site for **AestheticX**, an iOS app for Australian
aesthetic-medicine practices. Built to match the app's "Porcelain & Ink"
design system.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS v4 · next/font.
Single-page scroll with anchor navigation, deployed on Vercel.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

## Structure

| Path | What |
|---|---|
| `src/app/layout.tsx` | Fonts (Fraunces · Albert Sans · Fragment Mono), SEO/OG metadata |
| `src/app/globals.css` | "Porcelain & Ink" design tokens (`@theme`), grain/atmosphere, motion |
| `src/app/page.tsx` | Page composition + JSON-LD structured data |
| `src/components/` | Section components (Hero, RoleTintShowcase, FeatureSections, …) |
| `src/lib/content.ts` | Marketing copy + feature/FAQ/role data |
| `src/lib/site.ts` | Centralised placeholders (App Store URL, contact email) |

## TODO before launch

These are clearly marked in code:

- [ ] `src/lib/site.ts` — real **App Store URL** and **contact email**
- [ ] `src/app/layout.tsx` — production **domain** (`SITE_URL`)
- [ ] `src/components/SiteFooter.tsx` — real **Privacy** and **Terms** pages
- [ ] Add real **app screenshots** to replace the stylised UI mocks
- [x] Brand icon — `public/logo-mark.png` (in-page logo), `src/app/icon.png` (favicon), `src/app/apple-icon.png`, and `public/og-image.png`

## Notes

The design tokens mirror `AestheticX/design/ui/DESIGN.md`. The site is a
promotional surface only — it is not the app, and it does not provide medical
or legal advice.
