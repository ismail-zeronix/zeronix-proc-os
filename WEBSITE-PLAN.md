# zeronixtech.com: public website plan (Phase 17, branch `website`)

## 1. Context
Zeronix is building a new public website, **zeronixtech.com**. It runs beside the WordPress zeronix.ae site. The site sells business IT to **UAE corporates, organised by industry**:
- business laptops;
- desktops;
- workstations;
- servers;
- and later more, such as monitors, networking and accessories.

Visitors browse by the job they need done, for example:
- "Best laptops for real estate agents";
- "Desktop setup for design firms";
- "Workstations for architects".

They see:
- models that are **available in the UAE**;
- comparisons;
- full specifications taken from the brand's site;
- FAQs.

Every page then pushes one action: **"Looking for B2B pricing?"** This opens the chat widget or a quote form, already filled in with the industry and the product.

Content is researched every day with **claude-seo** (github.com/AgriciDaniel/claude-seo) and **uploaded as `.md` in the portal**. An upload lands as a **Draft**, and someone reviews and publishes it.

**The portal (ZeronixOS) is the control panel and the only source of data.** It holds content, the catalog, analytics and chat leads.

**Later**, the same site becomes a **B2B + B2C online shop** (section 11). So from day one the data model, the URLs and the user interface are built as a catalog.

- **Name:** Zeronix Tech
- **Tagline:** *"Business IT, matched to your industry."*
- **Secondary line:** "UAE-stock laptops, desktops, workstations and servers, with corporate pricing."

## 2. Branch, folders, isolation
- The branch is **`website`**, created from `dev`. Merge or push only when asked.
- **`website/`**: the public site. It is a standalone Next.js 16 app with its own `package.json`, `Dockerfile` and README, and its own image, `zeronix-site`.
  - It never imports from `src/`. Before writing code, read `node_modules/next/dist/docs/` (as AGENTS.md says).
  - Fonts use `next/font/local` only.
- **`src/app/(app)/website/`**: the portal admin area, the **Website** app.
- **`src/lib/website/`**: the server code (catalog, content, Markdown import, SEO checks, analytics, Search Console, site API).
- **`src/app/api/site/`**: the read-only API that the public site calls.
- The root `.dockerignore` excludes `website`, and `website/Dockerfile` copies only `website/`.
- **The site container has no database, no portal code and no portal secrets.** The only secrets it holds are `SITE_API_KEY` and `REVALIDATE_SECRET`.
- **The website's data has its own database** (decided 2026-11-02): the `zeronix-site-db` Postgres container, separate from the ZeronixOS database.
  - Schema: `src/db/site-schema.ts`. Migrations: `src/db/site-migrations/`. Client: `siteDb` in `src/db/site.ts`.
  - Only the portal's Website code (`src/lib/website/`, `src/app/api/site/`, `src/app/(app)/website/`, `src/worker/website.ts`) imports `siteDb`.
  - Site traffic, analytics events, content and site images never touch the main database. If the site DB is down, only the Website app shows an error; every other app works.

## 3. Architecture
```
Visitor ─► Caddy ─► zeronix-site (website/, Next.js ISR) ── site-net ──► zeronix-app /api/site/* (x-site-key)
              └───► zeronix-app (portal) ◄── chat widget JS + /api/widget/* (CORS: zeronixtech.com)
zeronix-app ─► zeronix-postgres (ZeronixOS: CRM, accounts, procurement, chat)      backend network
            └─► zeronix-site-db (site_* tables only)  ── site-db-net (internal, only zeronix-app joins)
```
- **zeronix-site-db**: `postgres:16-alpine`, `mem_limit` 256m, small `shared_buffers`, its own `sitedb` volume and its own user and password (`SITE_POSTGRES_*`). The app reads it with `SITE_DATABASE_URL`.
  - Site images live in their own `sitemedia` volume (`SITE_FILES_DIR`), recorded in `site_media`.
  - `production/backup-postgres.sh` dumps both databases and both file volumes.
  - `scripts/migrate.ts` migrates the site DB as well when `SITE_DATABASE_URL` is set, so deploys need no extra step.
- **zeronix-site** is on `proxy-net`, so Caddy routes `zeronixtech.com` and `www` to `zeronix-site:3000`. The owner edits Caddy and DNS, not us.
  - It is also on the internal `site-net`, shared only with `zeronix-app`.
  - Pages use ISR: a 10-minute fallback, plus an **on-demand revalidate** that the portal calls on publish (`POST /api/revalidate` with a secret).
  - If the portal is down, the site keeps serving its cached pages.
- **Portal `/api/site/*`** checks the key (`timingSafeEqual`) and is rate limited (`allow()` from `src/lib/webchat/public.ts`). It returns only **published** records and public fields.
  - Images are served through the site's own `/media/[id]` route, so visitors never see the portal domain.
- **Shared contract:** typed response shapes in `src/lib/website/contract.ts`, with a copy in `website/src/lib/contract.ts`.
  - Both carry `CONTRACT_VERSION`. The site logs a warning when the versions differ.
  - A vitest test compares the two files.
- **Compose:**
  - add `zeronix-site` to `docker-compose.prod.yml` (`build: ./website`, `mem_limit` 256m, no host port, networks `proxy-net` and `site-net`);
  - add a local service on port 3300 to `docker-compose.yml`;
  - add `SITE_API_KEY`, `REVALIDATE_SECRET`, `SITE_URL=https://zeronixtech.com` and `PORTAL_INTERNAL_URL` to `.env.example`;
  - add `https://zeronixtech.com,https://www.zeronixtech.com` to `WEBCHAT_ORIGINS`.

## 4. Information architecture and URLs (built to become a shop)
| URL | What it is | Becomes in the shop |
| --- | --- | --- |
| `/` | Home: hero, industries grid, categories, featured guides, brands strip, B2B call to action | same, plus deals |
| `/industries` | All industries | same |
| `/industries/[industry]` | **Industry hub**: pain points, recommended setups for each role, guides, FAQ, call to action | same, plus a "shop this setup" bundle |
| `/guides/[slug]` | **Buying guide** (main SEO page), e.g. `best-laptops-for-real-estate-uae`: picks, comparison table, specs, FAQ | same, plus prices and add to cart |
| `/compare/[a]-vs-[b]` | Two or three models side by side, from structured specs | same |
| `/products` and `/products/[category]` | Catalog list with filters (brand, CPU, RAM, screen, use case or industry) | shop category page |
| `/products/[category]/[slug]` | **Product page**: gallery, key specs, full spec table, UAE notes (keyboard, warranty), "best for" industries, FAQ, B2B call to action | product page with price, stock and cart |
| `/brands/[brand]` | Brand page | same |
| `/blog`, `/blog/[slug]`, `/blog/category/[cat]`, `/blog/author/[slug]` | News, how-tos, authors | same |
| `/quote` | **B2B quote form**, filled in from the query (`?industry=&product=&guide=&qty=`) | becomes "Request B2B pricing" next to the cart |
| `/about`, `/contact`, `/privacy`, `/terms` | Company pages | plus returns, shipping and warranty |
| `/sitemap.xml`, `/robots.txt`, `/rss.xml` | SEO | plus a product feed (Google Merchant) |

**Mega menu** (header). It is built from the database and edited in the portal:
- **Industries**: real estate, architecture and design, engineering and construction, legal, healthcare and clinics, finance and accounting, education, hospitality, logistics, media and production, retail, government contractors. Each column shows the industry's top guides, for example "Best laptops for real estate", "Desktop setup for design firms" and "Workstations for architects".
- **Products**: business laptops, desktops, workstations (mobile and tower), servers (tower and rack), and later monitors, networking and accessories. Each category has links by brand and by use.
- **Guides and comparisons**: the newest and the most read.
- **Brands**: HP, Dell, Lenovo, Apple, ASUS, Microsoft and others.
- A prominent **"Get B2B pricing"** button.
- Placeholders for the shop are reserved but hidden behind `COMMERCE_ENABLED`: search, account and cart icons.

## 5. Data model (`site_*` tables in the site database, one drizzle migration per phase)
All of these live in `zeronix-site-db`. A link to a ZeronixOS record (a user, a procurement product, a CRM deal) is a **plain id with no foreign key**, because it points into the other database; the code looks the record up in the main DB when it needs it.

**People and files**
- **`site_authors`**: `portalUserId`, `slug`, `name`, `jobTitle`, `bio`, `photo`, `links`. It is created from the uploader's user on their first upload and is edited in the Website app, for E-E-A-T (who wrote this and why they know).
- **`site_media`**: the site's images (name, MIME type, size, stored name, alt, source), stored on the `sitemedia` volume.

**Catalog**
- **`site_industries`**:
  - `slug`, `name`, `icon`, `heroTitle`, `intro` (Markdown);
  - `painPoints` (jsonb);
  - `roles` (jsonb: role, needs and recommended categories, e.g. "Agent: light, long battery, 14-inch");
  - `faq` (jsonb), `seo` (jsonb), `sort`, `status`.
- **`site_categories`**: `slug`, `name`, `parentId` (a tree, so new categories are rows not code), `specTemplate` (jsonb: which spec groups and fields this category shows and filters on), `seo`, `sort`, `status`.
- **`site_brands`**: `slug`, `name`, `logoFileId`, `website`, `uaeWarrantyNote`.
- **`site_products`**:
  - Identity: `slug`, `categoryId`, `brandId`, `name`, `series`, `mpn` (the manufacturer part number, including the UAE or Middle East variant, e.g. `#ABV` for an Arabic/English keyboard).
  - Images and marketing: `images` (file ids and alt text), `highlights[]`.
  - Specs: `specs` (jsonb, following the category's `specTemplate`: CPU, RAM, storage, display, GPU, ports, weight, battery, OS, security and so on).
  - UAE details: `uaeAvailable` and `uaeNotes` (keyboard, warranty, region).
  - Sources: `sourceUrl` (the brand's spec page) and `specsCheckedAt`.
  - Fit: `bestFor` (a list of industry ids and roles), `pros[]`, `cons[]`, `faq`, `seo`, `status`.
  - **Ready for the shop:**
    - `portalProductId`, a link to the procurement `products.id`, matched on brand and part number. It will later bring cost, supplier stock and price.
    - `priceMode` (`hidden` | `on_request` | `public`, defaulting to `on_request`), `listPrice`, `currency` (AED), `vatIncluded`. These stay unused until the shop goes live.
    - `site_product_variants` (RAM, storage and colour options) is created now but stays empty.
- **`site_product_links`**: product, industry, role, rank and the "best for" label. This is what makes "best laptops for real estate" a query rather than hand-written HTML.

**Content**
- **`site_posts`**, one table for all long-form content:
  - Type: `type` (`guide` | `comparison` | `article` | `industry_page`).
  - Content: `slug`, `title`, `metaTitle`, `metaDescription`, `excerpt`, `body` (Markdown), `bodyHtml` (rendered and sanitised).
  - SEO: `primaryKeyword`, `keywords[]`, `faq`, `schema`, `seoChecks`.
  - Links: `industryId`, `categoryId`, `products` (jsonb: product slug or id, rank, label, verdict, pros and cons).
  - Images and source: `cover`, `sourceFile`.
  - Workflow: `status` (`draft` | `scheduled` | `published` | `archived`), `publishAt`, `publishedAt`.
  - People: `authorUserId` (**the person who uploaded it**; an admin can change it), `publishedBy`, `reviewNotes`.
- **`site_post_revisions`**: a snapshot of the post on every upload or edit.
- **`site_settings`**: one row of jsonb: brand, tagline, contact details, home sections, mega menu overrides, footer, default SEO, Organization and LocalBusiness schema, call-to-action text.

**Leads and analytics**
- **`site_quote_requests`**:
  - What they asked for: `industry`, `products` (jsonb with quantities), `sourcePage`, `cta`.
  - Who they are: `name`, `company`, `email`, `phone`, `users`, `budget`, `timeline`, `notes`, `utm`, `visitorKey`.
  - What happened: `crmDealId`, `status`.
- **`site_events`**:
  - Columns: `at`, `type`, `path`, `postId`, `productId`, `industryId`, `visitorKey` (a hash, never the IP), `sessionKey`, `referrer`, `utm`, `country`, `device`, `target`, `value`.
  - Types: `pageview` | `scroll` | `click` | `cta_click` | `chat_open` | `chat_lead` | `quote_submit` | `compare` | `filter`.
  - Kept 13 months.
- **`site_daily`**: nightly rollups for the dashboards.
- **`site_search_daily`**: the Search Console import (date, page, query, country, device, clicks, impressions, CTR, position).
- Quote requests also keep the **first touch**: `landingPath`, `firstReferrer`, `source` and `utm`, so every lead shows the page and search that brought it.

**SEO plan**
- **`site_keywords`**: `keyword`, `cluster`, `intent`, `industryId`, `categoryId`, `priority`, optional `volume` and `difficulty`, `source` (`research` | `gsc` | `csv`), `targetPostId`, `status` (`idea` | `planned` | `writing` | `draft` | `published`), `plannedFor`, `notes`.
- **`web_chats`** gains two columns:
  - `site`, the host taken from the origin;
  - `context` (jsonb: industry, product, guide and call to action, sent by the B2B call-to-action button).

## 6. Content pipeline (claude-seo → .md → Draft → Publish)
**Daily workflow:**
1. Pick the target with `/seo cluster` and `/seo content-brief`, for example "best laptops for real estate agents UAE".
2. Collect specs from the brand's site for UAE-available models: Claude reads the brand spec page and the UAE store or part number.
3. Write the guide with claude-seo (Claude Blog), using `/seo schema` and `/seo geo` for the FAQ and AI-search readiness.
4. Save it as `.md`.
5. **Upload it in Website › Content.** It lands as a Draft with a checklist.
6. A reviewer checks it and presses Publish. The site updates within seconds.

**Upload formats.** The front matter decides what kind of record the file is. A `.zip` can carry the `.md` plus an `images/` folder.

*Guide or comparison:*
```yaml
---
type: guide                       # guide | comparison | article | industry_page
title: "Best Laptops for Real Estate Agents in the UAE (2026)"
slug: best-laptops-for-real-estate-uae
meta_title: "…≤60"
meta_description: "…≤155"
primary_keyword: "best laptops for real estate agents uae"
keywords: [ … ]
industry: real-estate             # matches site_industries.slug (created as a draft industry if new)
category: laptops
products:                          # each one matches site_products by mpn or slug, or is created as a draft product
  - mpn: "A1B2C3EA#ABV"
    label: "Best overall"
    verdict: "…"
    pros: [ … ]
    cons: [ … ]
faq:
  - q: "…"
    a: "…"
cover: images/cover.webp
cover_alt: "…"
cta: "Get B2B pricing for your agency"
---
Markdown body. `{{compare}}`, `{{product:mpn}}` and `{{cta}}` are shortcodes that the site renders as live components.
```

*Product (one model with full specs):*
```yaml
---
type: product
name: "HP EliteBook 840 G11"
brand: HP
category: laptops
mpn: "A1B2C3EA#ABV"
source_url: "https://www.hp.com/ae-en/…"
specs:
  processor: "Intel Core Ultra 7 155U"
  memory: "16 GB DDR5"
  storage: "512 GB NVMe SSD"
  display: "14\" WUXGA IPS 400 nits"
  weight: "1.36 kg"
uae: { keyboard: "Arabic/English", warranty: "3 years HP Middle East" }
best_for:
  - { industry: real-estate, role: "Agents on the move" }
pros: [ … ]
cons: [ … ]
faq: [ … ]
---
Short description in Markdown.
```

**How the import works:**
- The parser uses `gray-matter` and accepts snake_case or camelCase field names. The body is rendered with `unified`, `remark-gfm` and `rehype-sanitize`.
- **The portal renders the HTML**, so the site never parses Markdown.
- Images go into `site_media` and the `sitemedia` volume (`src/lib/website/media.ts`), never into the Files app.
- **SEO checklist** (stored in `seoChecks` and shown on the draft):
  - title and meta description length; H1 and H2 structure;
  - where the keyword appears; alt text; word count;
  - internal links resolve; the slug is unique; the FAQ is valid;
  - every product in a guide exists and is published;
  - every spec has a `source_url`; specs are older than 6 months (a warning to re-check).
- **Image rights:** use official partner or reseller press images, or our own photos. The source of each image is recorded.

## 7. B2B pricing call to action (the conversion engine)
- **Where it appears:**
  - a sticky bar and an inline block on every guide, product, industry and comparison page;
  - a "Get B2B pricing" button in the header;
  - the `{{cta}}` shortcode inside articles.
- **What a click does:**
  - It opens a small choice: **"Chat with sales now"** (only shown when agents are online, which the widget already knows) or **"Send a quote request"**.
  - **Chat** calls the widget's new API, `window.ZeronixChat.open({ context, message })`.
    - The first message is filled in, e.g. "Hi, I'm looking for B2B pricing on HP EliteBook 840 G11 for a real estate team."
    - The context (industry, product, guide, call to action) is saved on `web_chats.context` and shown in the visitor panel.
  - **Quote form** opens `/quote?industry=real-estate&product=…&guide=…`.
    - It arrives filled in with the industry, the product or products, and a quantity.
    - The visitor adds their company, name, email, phone, number of users, budget, timeline and notes.
- **Quote list** (the forerunner of the cart):
  - an "Add to quote list" button on product cards and pages;
  - the list is kept in `localStorage` and sent as one request;
  - in the shop it becomes the cart.
- **In the portal**, a quote request creates a **CRM lead and deal**:
  - source "Website · zeronixtech.com";
  - the products and quantities as a note;
  - the industry as a tag;
  - it reuses the CRM create code that Prospecting's "Convert to lead" uses.
  - It also rings the same way a website chat does, and shows in Website › Leads.

## 8. Portal admin: the **Website** app
It is a row in `src/lib/apps.ts` with the `Globe` icon, given to admins by default. It uses the AppShell sidebar pattern of `src/app/(app)/prospecting/layout.tsx` and the UI density rules.

- **Overview** (the analytics dashboard; range 7, 30 or 90 days, compared with the previous period):
  - KPI tiles: visitors, page views, average engaged time, call-to-action clicks, chats, quote requests, conversion rate, and deals created and won from the site.
  - Charts: traffic trend, leads trend, the funnel (visit → call to action → chat or quote → deal → won), traffic sources (Google, Bing, AI assistants, social, referral, direct), devices, countries, leads by industry, zeronix.ae chats against zeronixtech.com chats, and publishing pace against the plan.
  - Tables: top pages with their leads and conversion, and the newest leads with the page that brought them.
  - Search Console: clicks, impressions, top queries and average position.
  - Setup checks show only while something is missing.
- **SEO**: the keyword plan (clusters with coverage, the content calendar, CSV import of research or Keyword Planner exports) and, once Search Console is connected, the position of each keyword and the opportunities (queries in positions 8–30, pages with many impressions and a low CTR).
- **Content**:
  - tabs for Drafts, Scheduled, Published and Archived, with a type filter;
  - **Upload .md/.zip**;
  - a post page with preview, checklist, editable fields, a Markdown editor, revisions, Publish/Schedule/Unpublish, and per-post analytics with its queries.
- **Catalog**:
  - Industries, Categories (spec templates), Brands and Products;
  - list-first tables and forms;
  - product `.md` upload;
  - an "Link to portal product" picker, which searches procurement products by part number.
- **Leads**: quote requests and chats from the site, each with a link to its CRM deal.
- **Pages**: home sections, mega menu, footer, about and contact.
- **Analytics**:
  - filters (date, source, page, industry, device, country);
  - a conversion funnel: view → call-to-action click → chat or quote → deal won;
  - **Export JSON/CSV**, for Claude.
- **Settings**: brand, contact details and call-to-action text; Search Console service account (encrypted with `src/lib/crypto.ts`) with a Test button. `SITE_API_KEY` and `REVALIDATE_SECRET` live in the server `.env`, not in the database, because both containers need the same value; to rotate one, change `.env` and restart both. Website › Overview shows whether each is set and whether the site answers.
- **Permissions:**
  - Admins, and sales users with the app, can upload, edit and publish.
  - The byline shows the uploader: name, job title, photo and an author page with `Person` JSON-LD.
  - Server actions return `{ error }` the way `src/lib/prospecting/result.ts` `attempt()` does.

## 9. Public site UI (premium, and built to scale into a shop)
- **Stack:**
  - **Tailwind CSS v4** and **shadcn/ui** (its own `components.json` in `website/`);
  - **Motion** (`motion/react`, respecting reduced motion);
  - **lucide-react**, **Embla** carousels, **@tailwindcss/typography**, **next-themes**;
  - **nuqs** for filter state in the URL;
  - fonts loaded with `next/font/local`, for example Geist or Inter.
- **Look:**
  - a modern corporate tech style: a dark hero with a subtle grid and glow;
  - bento grids for industries and categories, and a strip of brand logos;
  - trust signals: UAE stock, warranty, delivery across the Emirates, corporate accounts;
  - clean cards and generous spacing.
  - Show a **home page screenshot to the owner for approval** before building the inner pages.
- **Component layers.** These keep the site easy to scale, and the shop reuses them:
  - `components/ui/*`: shadcn primitives.
  - `components/layout/*`: Header, **MegaMenu** (built from data), MobileNav, Footer, Breadcrumbs, StickyCta.
  - `components/catalog/*`: ProductCard, ProductGrid, **SpecTable** (driven by the category template), **CompareTable**, FilterSidebar, BrandStrip, **PriceBlock** (shows "Request B2B price" now and prices later), **QuoteListButton**, which becomes AddToCart.
  - `components/content/*`: Prose, Toc, FaqAccordion (with FAQPage JSON-LD), AuthorBox, RelatedGuides, Shortcodes.
  - `components/cta/*`: CtaBar, CtaChooser, QuoteForm.
  - `lib/api.ts`: one typed client for the portal API. It is the only place that fetches.
  - `lib/flags.ts`: `COMMERCE_ENABLED` and the like.
- **SEO:**
  - metadata, canonical URLs and an Open Graph image route;
  - JSON-LD for Organization, LocalBusiness, WebSite with a SearchAction, BreadcrumbList, BlogPosting or Article, FAQPage, ItemList (guides), Product (with an offer only once there are prices), and Person (authors);
  - hreflang ready for Arabic later;
  - aim for Lighthouse scores of 95 or more.
- **Tracker:**
  - an inline, cookie-less script that sends with `sendBeacon` to the site's `/api/t`, which passes events to the portal;
  - events: page views, scroll and time on page, outbound links, and `data-track` call-to-action clicks;
  - the widget fires `zeronix-chat:open` and `zeronix-chat:lead`, which the tracker records.

## 10. Chat on two sites
- Sessions started from zeronixtech.com save `web_chats.site` from the origin (`originOf()` in `src/lib/webchat/public.ts`).
- `widget/zeronix-chat.js` gains:
  - `data-site`;
  - a public `window.ZeronixChat.open({ context, message })`;
  - DOM events for the tracker;
  - a theme taken from data attributes, so it matches the new site.
- The portal's Website chats (`src/components/chat/web-*.tsx`) show:
  - a **site badge**;
  - the context card (industry and product);
  - and set the lead source to "Website · <site>" when a chat is saved as a lead.

## 11. Ecommerce roadmap (later, B2B + B2C)
Nothing here is built in Phase 17. The tables, URLs, components and flags above are shaped so these phases add to the site rather than rebuild it.

| Phase | Scope |
| --- | --- |
| **E.1 Prices** | Public B2C prices (AED, VAT 5% included); B2B prices hidden until login; `priceMode` for each product; price and stock come from the linked procurement product (supplier offers and margin rules) and are reviewed in the portal |
| **E.2 Accounts** | B2C accounts; **B2B company accounts** (TRN, several users, approval by the sales team, price tier, credit terms) |
| **E.3 Cart and checkout** | The quote list becomes a cart; checkout with UAE gateways (Network International N-Genius, Telr or Stripe UAE) and buy-now-pay-later (Tabby or Tamara); B2B checkout can be "pay by invoice" |
| **E.4 Orders into the portal** | A web order becomes a **Sales order**, then the existing delivery, tax invoice and payment flow (order-to-cash); stock is reserved |
| **E.5 Fulfilment** | Shipping rates (Aramex or a local courier), tracking emails, returns and RMA, warranty claims |
| **E.6 Growth** | Google Merchant product feed, site search (Postgres FTS or Meilisearch), reviews, bundles ("Real-estate office starter kit"), Arabic site |

**Rules that keep this possible now:**
- Products have stable slugs and URLs.
- Prices live in data, never in templates.
- Product pages already render `PriceBlock` and `QuoteListButton`.
- Every lead and request carries `products[]` with quantities.
- The site reaches the portal only through `/api/site/*`, so checkout can later be added as `/api/site/commerce/*` with the same isolation.

## 12. Phases for Phase 17 (TASKS.md)
1. **W.1 Foundation**:
   - the `website/` scaffold (Next 16, Tailwind v4, shadcn, Dockerfile);
   - the `site_*` tables and migration;
   - the Website app tile;
   - the site API key and the `/api/site/*` skeleton, plus the shared contract;
   - the compose services.
2. **W.2 Design system and home page**: the layout, the mega menu (from data), the home page sections, `site_settings` and the Pages editor. **Get the owner's approval on the home page preview.**
3. **W.3 Catalog**:
   - industries, categories (spec templates), brands and products in the portal, with product `.md` upload;
   - industry hubs, category lists with filters, product pages, brand pages, comparison pages.
4. **W.4 Content pipeline**:
   - the `.md`/`.zip` upload of guides and articles, the checklist, preview, editor, revisions and publish/schedule with revalidation;
   - guide pages with picks and the comparison table, the blog, author pages, sitemap, RSS and JSON-LD.
5. **W.5 B2B call to action and leads**: CtaBar and CtaChooser, the widget's `open()` with context, the `/quote` form filled in from the link, the quote list, the CRM lead and deal, and Website › Leads.
Rewritten on 2026-11-02, after W.1–W.5 were done:

6. **W.6 Site database**: the `zeronix-site-db` container, `site-schema.ts` and its own migrations, `siteDb` for the Website app only, `site_authors` and `site_media` (own volume), the local data move, and backups of both databases.
7. **W.7 Tracker and analytics**: the tracker, `/api/t` passing events to `/api/site/events`, first-touch lead attribution, the rollups, the **Overview dashboard**, the Analytics page with filters and JSON/CSV export, and per-post stats.
8. **W.8 SEO workspace and first content**:
   - Website › SEO: keywords, clusters, calendar and CSV import;
   - SEO research from the web (`website/content/seo-research.md` and `keywords.csv`);
   - the **first 6 posts** (a pillar post and 5 industry guides) with real UAE-available models, as `.md` drafts in `website/content/` for the owner to upload and publish;
   - a "Quote all picks for my team" call to action on guides.
9. **W.9 Search Console**: the encrypted service account, the daily import (in the worker), and the queries shown on the Overview, the SEO page and each post.
10. **W.10 Proper site and go-live**:
    - company pages: About, Contact, Privacy, Terms, Delivery & warranty (post type `page`);
    - technical SEO: Open Graph images, structured data and breadcrumbs everywhere, related-guide links, sitemap `lastmod`, a 404 page, Lighthouse 95+, and an SEO audit;
    - an update to `production/README.md` with the site DB, DNS, the Caddy route to `zeronix-site:3000`, the env and the build steps.
11. **W.11 Owner**:
    - point zeronixtech.com, add the Caddy route, and create the Search Console service account;
    - set the site DB and site values in `.env`;
    - upload and publish the first posts, then one or more a week from the SEO calendar.

## 13. Files to reuse
- `src/lib/webchat/public.ts`: `allow()`, `originOf()` and `clientIp()`.
- `src/lib/webchat/device.ts`: device parsing.
- `widget/zeronix-chat.js`.
- `src/lib/files-store.ts`, `src/lib/crypto.ts`, `src/lib/apps.ts`.
- `src/app/(app)/prospecting/layout.tsx`: the AppShell layout to copy.
- `src/lib/prospecting/result.ts`: the `attempt()` error pattern.
- `src/lib/products.ts`: `productLabel` and the part-number matching, used to link procurement products.
- The CRM lead creation used by Prospecting's convert.
- `src/worker/`: the daily jobs.
- `docker-compose.prod.yml`, `production/README.md`, `.env.example`.

## 14. Verification
- In the root: `npm run typecheck`, `npm run lint` and `npm test`.
- Unit tests (vitest) for:
  - the front matter parser (guide, product and article samples) and the checklist;
  - `/api/site/*`: the key is required, and drafts are never returned;
  - the contract files match;
  - the quote request becomes a CRM lead;
  - event checks and the rollup maths;
  - the Search Console request, with a mocked fetch.
- In `website/`: `npm run build`. Then run the portal (3101, `RUN_WORKER=false`) and the site (3300) locally:
  1. upload a product `.md` and a guide `.md`, and check they are drafts and not on the site;
  2. publish them, and check the guide page, comparison table, JSON-LD, sitemap and mega menu entry;
  3. click "Get B2B pricing", then check that the chat opens with its context and that the quote form is filled in;
  4. send the quote form, and check a CRM deal with the source "Website · zeronixtech.com";
  5. check the events and the dashboard.
- Take screenshots with headless Edge and puppeteer-core, at desktop and mobile width.
- **Isolation checks:**
  - the `zeronix-site` image has no `src/`, `.env`, migrations or `DATABASE_URL`;
  - `/api/site/*` without the key returns 401.
- No dummy data in production.
