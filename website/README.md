# Zeronix Tech: zeronixtech.com

The public site, **"Business IT, matched to your industry."** It runs beside the WordPress zeronix.ae.

It covers business laptops, desktops, workstations and servers for UAE corporates, organised by industry. Later it becomes a B2B + B2C shop.

- Plan: [WEBSITE-PLAN.md](../WEBSITE-PLAN.md)
- Tasks: TASKS.md, Phase 17

## How it fits together

- **A separate app.** This is a standalone Next.js 16 app with its own `package.json`, `Dockerfile` and Docker image (`zeronix-site`).
  - It never imports from the portal's `src/`.
  - The image is built from this folder only.
  - The portal's root `.dockerignore` and `tsconfig.json` exclude this folder.
- **No database.**
  - Content comes from the portal's read-only `/api/site/*`, which returns published records and public fields only. The site calls it with `SITE_API_KEY` over the internal `site-net` network.
  - `src/lib/api.ts` is the only file that talks to the portal.
  - `src/lib/contract.ts` is a copy of the portal's `src/lib/website/contract.ts`, and a test fails if the two differ.
- **The portal is the control panel.** Its **Website** app (`src/app/(app)/website/`) manages content, catalog, leads, analytics and settings.
  - When something is published, the portal calls this site's `POST /api/revalidate` with `REVALIDATE_SECRET`.
  - Otherwise pages refresh every 10 minutes.
  - If the portal is down, the site keeps serving its cached pages.
- **Chat** uses the portal's existing widget (`widget/zeronix-chat.js`) with `data-site`, so each chat is tagged with its site (W.5).
- **Search engines are kept out until go-live.** `robots.txt` disallows everything and pages carry `noindex` until `SITE_INDEXING=true`.

## Run it locally

1. Give the portal the keys in its `.env`:
   - `SITE_API_KEY`
   - `REVALIDATE_SECRET`
   - `SITE_INTERNAL_URL=http://localhost:3300`
2. Copy `.env.example` to `.env.local` here, using the same key and secret, and set `PORTAL_INTERNAL_URL` to the portal's address (the dev server is `http://localhost:3101`).
3. Install, then run:

```bash
cd website
npm install
npm run dev          # http://localhost:3300
npm run build && npm start
npm run typecheck && npm run lint
```

**Docker:**
- Locally: `docker compose --profile site up -d --build` serves the site on port 3300.
- On the server: see `production/README.md` (the "Public website" section).

## Environment

| Variable | What it is |
| --- | --- |
| `PORTAL_INTERNAL_URL` | Where the portal is (production: `http://zeronix-app:3000`) |
| `SITE_API_KEY` | Same value as on the portal, at least 24 characters |
| `REVALIDATE_SECRET` | Same value as on the portal, at least 16 characters |
| `SITE_URL` | `https://zeronixtech.com`, used for canonical URLs and the sitemap |
| `SITE_INDEXING` | `true` only at go-live |
| `COMMERCE_ENABLED` | The shop (plan section 11); `false` |

## Pictures

- **Uploaded in the portal** (Website › Catalog): industry, category and product pictures are kept by the portal in the website database (`site_media`) and its own `sitemedia` volume, and served here at `/media/<id>`.
- **Generated** (home page, industry and category fallbacks): `npx tsx scripts/site-images.ts` in the portal repo writes `website/public/images/<name>.png|jpg`. It uses the OpenRouter key from Prospecting › Settings (image models need at least $1 credit on the account). The prompts are in `scripts/site-images.prompts.ts` and follow BRAND.md section 7. `--check` shows the credit, `--force name` makes an image again.
- **Templates** for your research output: `templates/guide-template.md` (guides, comparisons, blog posts) and `templates/product-template.md`.
- A name with no picture shows a labelled photo slot (`components/brand/photo.tsx`), so the page never breaks.
