# zeronixtech.com: SEO and AI search plan

**Goal:** get zeronixtech.com indexed by Google and Bing, and have ChatGPT, Gemini, Claude, Perplexity and Copilot name and link Zeronix Tech when someone in the UAE asks which business laptops, desktops or IT services to buy.

**Sources:** the claude-seo skills (github.com/AgriciDaniel/claude-seo: `seo-geo`, `seo-agentic`, `seo-technical`), llmstxt.org, indexnow.org, contentsignals.org, and Google's structured-data docs. Audit of the live site on 2026-11-04.

**Status:** Phase 1 is coded on branch `website` and not committed. Phase 2 needs the owner. Phases 3–5 are ongoing work.

---

## How AI assistants find a website

None of the assistants has a "submit your site" form. Each one reads one of the big search indexes, so the job is to be in those indexes, easy to quote, and named by other sites.

| Assistant | Where its answers come from | What we must do |
|---|---|---|
| **ChatGPT** (search) | Bing's index plus its own crawler, `OAI-SearchBot` | Bing Webmaster Tools, IndexNow, allow `OAI-SearchBot` |
| **Microsoft Copilot** | Bing | Bing Webmaster Tools, IndexNow |
| **Google Gemini, AI Overviews, AI Mode** | Google's index (`Googlebot`) | Search Console, sitemap, structured data |
| **Claude** (web search) | Brave Search plus `Claude-SearchBot` | allow `Claude-SearchBot` and `Claude-User`; Brave's crawler follows normal search signals |
| **Perplexity** | its own crawler, `PerplexityBot` | allow it |
| **Apple Siri / Spotlight** | `Applebot` | allow it |
| **What models "know" without searching** | training crawls: `GPTBot`, `ClaudeBot`, `Google-Extended`, Common Crawl `CCBot`... | allowed (owner wants the brand everywhere); brand mentions on other sites |

The single biggest lever after indexing is **other sites mentioning Zeronix Tech**: LinkedIn, Google Business Profile, Reddit, YouTube, UAE directories, brand partner pages (Phase 4).

---

## Audit of the live site (2026-11-04)

| Check | Before | After Phase 1 |
|---|---|---|
| robots.txt | `Disallow: /` (SITE_INDEXING=false) | named groups for search, training and user agents, Content-Signal, private paths closed. Opens when SITE_INDEXING=true |
| `<meta name="robots">` | `noindex, nofollow` | `index, follow, max-image-preview:large` at go-live |
| www.zeronixtech.com | 200, a full duplicate of the site | 308 to zeronixtech.com |
| sitemap.xml | 170 URLs, lastmod present | unchanged (good) |
| Home canonical | missing | `/` |
| Favicon | SVG only | favicon.ico (16/32/48), SVG, apple-touch-icon, 192/512 PNG, maskable icon, web manifest |
| Organization / WebSite schema | none | sitewide `@graph`: Organization + OnlineStore (contact, address, area served, sameAs), WebSite with SearchAction |
| Product schema | no price | `Offer` with AED price incl. VAT, availability, condition, seller (only for products with a public price) |
| Breadcrumb, FAQ, Article, ItemList schema | present | unchanged |
| llms.txt | missing | `/llms.txt` (site map for assistants) and `/llms-full.txt` (every product with price, part number, specs) |
| IndexNow | none | key file `/indexnow.txt`, auto-ping on publish, one-shot full submit |
| Search Console / Bing verification | none | `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` env values print the meta tags |
| OG image | default image on pages without a cover | unchanged (products and posts use their own picture) |
| Unknown URL | real 404 | unchanged (good: agent checks fail on a catch-all 200) |
| Category product counts (site API) | always 0 (SQL bug) | fixed |

---

## Phase 1: technical SEO and AI access (coded, branch `website`)

1. **robots.txt** (`website/src/app/robots.txt/route.ts`, lists in `src/lib/seo.ts`)
   - One group each for search bots, training bots and user-triggered agents, then `*`. Each group repeats the rules, because a bot that finds its own group ignores `*`.
   - `Content-Signal: search=yes, ai-input=yes, ai-train=yes` (owner wants the brand in every model).
   - Closed: `/api/`, `/cart`, `/checkout`, `/account`, `/search`, `/brand` (style guide). Open: everything else, including `/media/` pictures.
   - Header comment points agents to `/llms.txt`; `Sitemap:` line at the end.
2. **llms.txt and llms-full.txt** (`src/lib/llms.ts`, data from the new portal endpoint `/api/site/llms`)
   - Title, one-line summary, what the company is, key facts (B2B + B2C, all seven emirates, AED incl. 5% VAT, UAE warranty, how to buy, contact, official profiles).
   - "For AI assistants and agents": product URL pattern, search URL, quote URL with `?product=`, sitemap and RSS, a request to link product pages.
   - Sections: categories (with counts), industries, brands, buying guides, IT services, articles, company pages.
   - llms-full.txt adds every published product: name, brand, part number, price or "price on request", key specs, highlights.
   - Built from published content on every request (cached 10 minutes), so it never goes stale. `X-Robots-Tag: noindex` keeps the text file itself out of Google results.
3. **www redirect** (`src/proxy.ts`): `www.` host → `SITE_URL`, 308, path and query kept.
4. **Icons** (`src/app/favicon.ico`, `apple-icon.png`, `public/icon-*.png`, `src/app/manifest.ts`), made from `icon.svg`.
5. **Root metadata** (`src/app/layout.tsx`): robots with large image previews, publisher, RSS alternate, Twitter card, verification tags, and the Organization/WebSite JSON-LD (`siteJsonLd` in `src/lib/seo.ts`).
6. **Product offers** in the Product JSON-LD (`products/[category]/[slug]/page.tsx`). "Price on request" products get no offer rather than a made-up one.
7. **IndexNow** (`src/lib/indexnow.ts`)
   - Key file at `/indexnow.txt` (404 until `INDEXNOW_KEY` is set).
   - Every portal publish (revalidate with `posts` or `catalog`) sends pages changed in the last 2 days, at most once per 10 minutes.
   - `POST /api/indexnow` with the `x-revalidate-secret` header sends the whole sitemap (for go-live).
8. **Portal:** Website › Settings › Brand has a new **Company profiles** field (LinkedIn, Google Business, Instagram... links). They go into schema.org `sameAs` and llms.txt, which is how search engines and assistants tie the site to the company.

---

## Phase 2: go-live (owner, about 1 hour)

Do these in order. Steps 1–3 are on the server; Claude can do them when asked.

1. **Content check.** Publish the products and posts you want visible; anything still "draft" stays hidden. Fill the marked parts of About, Terms, Privacy, Delivery & warranty.
2. **Server env** (`/srv/docker/zeronix-proc-os/.env`):
   ```
   SITE_INDEXING=true
   INDEXNOW_KEY=<openssl rand -hex 16>
   GOOGLE_SITE_VERIFICATION=        # step 4, only if you pick the HTML-tag method
   BING_SITE_VERIFICATION=          # step 6, only if you do not import from Google
   ```
   Then deploy (`production/deploy.sh`) or recreate the `zeronix-site` container.
3. **Check:** `https://zeronixtech.com/robots.txt` shows the groups, `/llms.txt` lists the catalog, `/indexnow.txt` shows the key, `https://www.zeronixtech.com/` moves to `https://zeronixtech.com/`.
4. **Google Search Console** (search.google.com/search-console)
   - Add property → **Domain** → `zeronixtech.com`. Google gives a TXT record; add it in Hostinger DNS (keep the email records). This covers www and http too. (Or URL-prefix property with the HTML tag: copy only the `content="..."` value into `GOOGLE_SITE_VERIFICATION`.)
   - Sitemaps → submit `https://zeronixtech.com/sitemap.xml`.
   - URL inspection → **Request indexing** for the home page, /products, each category, each industry and each guide (about 10 a day is the limit).
   - Settings → Users and permissions → add the service account email from Website › Settings › Search Console (Full or Restricted) so the daily import fills the Overview.
5. **Bing Webmaster Tools** (bing.com/webmasters): Sign in → **Import from Google Search Console** (verifies and brings the sitemap in one step). Check Sitemaps shows `sitemap.xml`. This is what feeds ChatGPT search and Copilot.
6. **IndexNow full submit** once:
   ```
   curl -X POST -H "x-revalidate-secret: $REVALIDATE_SECRET" https://zeronixtech.com/api/indexnow
   ```
   Bing Webmaster → IndexNow shows the URLs within a day.
7. **Profiles:** Website › Settings › Brand → Company profiles: paste the LinkedIn page, Google Business Profile and any social links (Phase 4 creates them).
8. **Validate:** Rich Results Test (search.google.com/test/rich-results) on the home page, one product, one guide; PageSpeed Insights on the home page and a product (target 90+ mobile).

---

## Phase 3: content that assistants quote (weekly, claude-seo)

Rules from `seo-geo`, applied to every guide, service page and category intro:

- **Answer first.** The first 40–60 words of a page and of each H2 section give the direct answer ("The best laptop for real estate agents in Dubai is ... because ..."). About 44% of AI citations come from the first third of a page.
- **Self-contained blocks** of roughly 130–170 words that make sense when quoted alone. Question-style H2/H3 headings that match how people ask ("Which laptop is best for AutoCAD in the UAE?").
- **Facts with sources:** UAE prices in AED, part numbers, warranty terms, battery hours, weights. Tables for comparisons, lists for steps.
- **Dates and authors:** visible published/updated dates and an author byline with job title (already built). Refresh the top pages every 3 months; pages untouched for 6+ months are cited less.
- **Unique data:** e.g. "UAE business laptop price index" (monthly, from our own catalog prices), "What 50 Dubai SMEs bought this year". Original data is what assistants cite.
- **Workflow:** `/seo cluster` → `/seo content-brief` → write → `/seo geo` and `/seo schema` on the draft → upload .md in Website › Content → publish (IndexNow pings automatically) → URL inspection in Search Console.
- **Calendar (first 8 weeks):** one buying guide and one comparison a week from Website › SEO; a page per IT service with pricing ranges and FAQs; category intros for laptops, desktops, workstations with "how to choose" blocks.

## Phase 4: brand presence off the site (owner and team, ongoing)

What makes ChatGPT and Perplexity name a company is mostly what *other* sites say about it.

1. **Google Business Profile** for Zeronix Tech (Dubai address, phone, categories "Computer store", "IT services", website link, photos, weekly posts). Ask happy customers for reviews. This feeds Google Maps, Gemini and AI Overviews.
2. **LinkedIn company page** with the website link; post each new guide.
3. **Bing Places for Business** (import from Google Business Profile).
4. **UAE directories:** Yellow Pages UAE, Connect.ae, Dubai Chamber member directory (if a member), brand partner locators (Lenovo, HP, Dell partner pages).
5. **Reddit** (r/dubai, r/UAE): helpful answers about business laptops and office IT, from a named account, with a link only when it helps. **YouTube:** short setup and comparison videos linking the guides. YouTube mentions correlate most strongly with AI citations in the claude-seo research.
6. **Wikidata** item for Zeronix Tech (company, country, website, LinkedIn) once there are two or three independent mentions.
7. Add each new profile link to Website › Settings › Brand → Company profiles.

## Phase 5: measure and repeat (monthly)

- **Search Console** (already imported daily into Website › Overview and SEO): indexed pages, queries in positions 8–30 to improve, pages with impressions but a low CTR (rewrite title and description).
- **Bing Webmaster:** indexed pages, IndexNow status, the "AI performance" report where shown.
- **AI visibility check:** each month ask ChatGPT, Gemini, Claude, Perplexity and Copilot 10 fixed questions ("best business laptop supplier in Dubai", "where to buy a ThinkPad for a law firm in the UAE"...) and log whether Zeronix Tech is named or linked. `/seo geo https://zeronixtech.com` for the score.
- **Website › Overview** sources already separate visits from chatgpt.com, perplexity.ai, gemini.google.com and copilot as referrers.

## Later (not built)

- **Google Merchant Center** free listings: a product feed (`/feed/google.xml`) from the same catalog data; needs shipping and return policy settings. Then `shippingDetails` and `hasMerchantReturnPolicy` in the Offer schema.
- **Split sitemaps** (products, posts, pages) once the catalog passes a few thousand products.
- **Markdown copies** of product and guide pages (`.md` or `Accept: text/markdown`) for agents, if Lighthouse's agentic checks start to matter.
- **Arabic pages** with `hreflang` for the top categories and industries.
- **Reviews** on product pages (real ones only) for `aggregateRating`.
