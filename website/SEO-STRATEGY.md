# zeronixtech.com: competitor analysis and plan to rank first

**For:** the owner and whoever writes, publishes or does outreach for zeronixtech.com.
**Made:** 2026-11-11, from an audit of the live site, the competitors' live sites and Google/Bing results. The method follows the claude-seo skills (github.com/AgriciDaniel/claude-seo).
**Goes with:**
- `SEO-PLAN.md`: technical base, Search Console, AI search; phases 1–5, built 2026-11-04.
- `content/seo-research.md`: industry clusters.
- Website › SEO in the portal: keywords, rankings, competitor gap.

---

## 1. Where we stand

**Live:** 179 URLs (126 products, 12 industries, 8 services, 6 guides). Indexing has been on since 2026-11-04. Bing-based search engines still show none of our pages: the site is too new and has no links pointing to it.

**What we already do better than every competitor:**
- Buying guides by industry. Nobody else in the UAE has them.
- Answer-first guides with a named author and date: what Google's E-E-A-T rewards and what ChatGPT, Gemini and Perplexity quote.
- Prices shown with VAT included. LastBestPrice shows prices without VAT; Axhubs and Promise don't say which.
- Full structured data, plus llms.txt, IndexNow, real 404s and fast pages.

**Fixed in code on 2026-11-11** (section 4 has the details):

| Problem found | Fix |
|---|---|
| Product pages had about 70 words of their own text | "About this model" text and a product FAQ, written from our own data (specs, part number, industries, stock, delivery); 250+ words per product |
| Product search titles were about 135 characters | `{model} {part number} Price in UAE \| Zeronix Tech`, 60 characters at most |
| Meta description promised "local warranty" on every product, including US part numbers | Price, part number and specs only; warranty appears only where an editor entered it |
| "Laptops in Dubai / in Sharjah …" × 7 emirates, all linking to the same pages | Removed (doorway pattern); one honest "we deliver to the seven emirates" line |
| Category title "Business laptops for business in the UAE" | "Business laptops in the UAE: HP, Lenovo, Dell" |
| Filtered lists (`?brand=hp`) could be indexed | `noindex, follow` |
| Any `/compare/a-vs-b` pair could be indexed | Indexed only when a published guide picks both products |
| Product Offer schema had no shipping or returns | `shippingDetails` from Settings › Store; `hasMerchantReturnPolicy` once a return window is set |
| No Google Shopping presence | Merchant feed at `/feed/google.xml` |
| Sitemap: no pictures; hub dates were "now" on every request | Product and guide pictures; real last-change dates |
| No street address or opening hours on the site | Settings › Brand fields for address, hours and map link. They show in the footer and on Contact; the site becomes a `ComputerStore` in schema once filled |
| "Brands 4+" next to 8 brands | Counted from the published brands |
| The compare page claimed "Every model has a UAE part number and local warranty" | "We confirm the exact part number, keyboard and warranty on your quote" |

**Still open (needs the owner or the team):**
- Google Business Profile, reviews and directory listings (section 5).
- Imported products carry US part numbers (…FUS, #ABA). Fill each one's keyboard and warranty in Website › Products, or switch it to the Middle East part number. Don't claim "UAE warranty" where it isn't true.
- Gaming models (HP OMEN, Lenovo Legion and LOQ) sit under "Business laptops". Create a **Gaming** category (slug `gaming`) and move them.
- Fix the "512B SSD" typo in one product's data.
- Press **Categories › Fill empty pages** in production: the category buying advice and FAQ are written but not loaded there.

---

## 2. Competitors

| Site | What it is | Strengths in search | Weak spots we beat |
|---|---|---|---|
| **uae.microless.com** | Large consumer e-shop, every category | Huge catalogue; English, Arabic and Russian; reviews; model numbers in titles; delivery dates | No guides, no B2B, no industry advice |
| **Amazon.ae, Noon, Carrefour, Sharaf DG, Jumbo** | Marketplaces and retail chains | Own the head terms ("laptops UAE", "Lenovo ThinkPad price") through authority | Generic listings; nothing for a company buying 10–50 machines |
| **axhubs.com** | Bulk/wholesale e-shop (WooCommerce): laptops, desktops, AIO, printers, monitors, components, gaming and business lines | Clean category, brand and product URLs; specs in the URLs; "wholesale price" and bulk-discount messaging | No content; alt text "Home 1…40"; "Rated 0/5"; no currency or VAT label; no address; empty links |
| **irix.ae** | B2B distributor. **The benchmark for B2B search** | "IT hardware supplier in Dubai" in title and H1; city URLs; sector pages (hotels, schools…); buyer guides; FAQ; address and map; "since 2008"; 1,000+ products; BOQ upload | No reviews or case studies; URL typos |
| **lastbestprice.com** | B2B/B2C reseller (Royal Data Systems) | Part number + "Price in Dubai UAE" in every title; servers, UPS and networking depth; partner certificates | Keyword stuffing; prices without VAT; "price updates in progress" banner; duplicate titles |
| **promisestores.com / promisegulf.com** | Authorised HP/Dell/Lenovo/NVIDIA dealer | "Authorized dealer" in title; workstation and server depth; HP and Dell price-list blog posts rank | `-copy` slugs; duplicate products; no VAT label; no address |
| **costtocost.ae** | Broad IT supplier | "in Dubai" in URLs and alt text; vendor pages | Empty blog, broken links, two company names |
| **aldhahab.ae, acl.ae, hcom.ae** | Wholesale B2B, quote forms | Rank for "B2B IT hardware supplier Dubai" | No prices, little content |
| **arabgamers.ae, GCC Gamers** | Gaming PC shops | Blog posts answering buyer questions ("budget gaming PC UAE under 3000"); emirate names in copy | Gaming only |
| **ae.pricena.com, yellowpages-uae.com** | Price comparison, directory | Rank for "<model> price in Dubai" and "laptop supplier Dubai" | **Get listed on both** |

"Dubai Gamers" has no website that can be found; ArabGamers and GCC Gamers cover that audience.

**What it means:**
1. **Head terms** ("laptops UAE", "buy laptop Dubai") belong to marketplaces with years of authority. Don't chase them first.
2. **Model and part-number searches** are won with short titles that hold the part number. Ours now do; the more products we list, the more of these we win.
3. **B2B supplier searches** ("corporate laptop supplier Dubai", "IT hardware supplier UAE", "workstation supplier Dubai") have weak results: directories, IRIX and blog-spam profiles. Beat IRIX with a better B2B hub page, real reviews and our guides.
4. **Industry and question searches** have no UAE answer. This is our moat, and also what AI assistants quote.
5. **Gaming** is a separate audience (Microless, Axhubs, ArabGamers). Give it its own category so "business laptops" stays clean.

---

## 3. Which searches to target

DataForSEO fills in real UAE volumes and difficulty: Website › SEO › Rankings › **Get volumes**.

| Tier | Intent | Examples | Page | Time to page one |
|---|---|---|---|---|
| A | Model / part number | "21V7006FUS price", "ThinkPad X1 Carbon Gen 14 price in UAE", "HP EliteBook 840 G11 Dubai" | Product pages | 2–8 weeks |
| B | B2B supplier | "corporate laptop supplier Dubai", "bulk laptops UAE", "IT hardware supplier UAE", "workstation supplier Dubai", "server supplier Dubai" | Home, categories, a new B2B hub guide | 2–4 months |
| C | Industry | "best laptops for real estate agents UAE", "laptops for architects Dubai", "computers for clinics Dubai" | /industries, /guides | 1–3 months |
| D | Questions (AI answers) | "is a laptop bought in Dubai covered by warranty abroad", "Arabic English keyboard laptop", "IT checklist new office Dubai" | Guides | 1–3 months |
| E | Comparison | "ThinkPad T14 vs EliteBook 840", "HP vs Lenovo business laptop" | Guides with picks (makes the compare page indexable) | 1–3 months |
| F | Brand / series | "Lenovo ThinkPad Dubai", "HP EliteBook UAE" | /brands | 3–6 months |
| G | Local | "computer shop Dubai", "IT supplier near me" | Google Business Profile + /contact | Needs GBP and reviews |

---

## 4. What was built (2026-11-11)

**Site (`website/`):**
- **Product copy:** `src/lib/product-copy.ts` builds the search title, meta description, "About this model" blocks and fallback FAQ. An editor's own summary, FAQ or SEO title always wins. A warranty or keyboard nobody entered is left out, never guessed. A US part number gets an honest note to confirm keyboard and warranty.
- **Product page:**
  - links to the guides that pick the product, the category and the brand;
  - Offer `shippingDetails`, and `hasMerchantReturnPolicy` once Settings › Store has a return window.
- **Category page:** new title; "Buying guides" and "by industry" links; `noindex` on filtered views.
- **Compare page:** `noindex` unless a guide picks the pair.
- **Sitemap:** pictures, and real last-change dates.
- **Merchant feed:** `/feed/google.xml` (`src/lib/merchant-feed.ts`). It lists products with a public price, a picture and stock; long ids are hashed to 50 characters.
- **Footer and Contact:**
  - the emirate keyword block is removed;
  - address, opening hours and map link show;
  - `ComputerStore`, `openingHours` and `hasMap` are added to the schema once filled.

**Portal:**
- **Settings › Brand:** opening hours and a Google Maps link. **Settings › Store:** return window (days).
- **Settings › DataForSEO:** API login (stored encrypted), monthly budget in USD, competitor domains.
- **Website › SEO › Rankings:**
  - **Get volumes:** UAE monthly searches and difficulty for planned keywords.
  - **Check rankings now:** runs automatically every Monday after 06:00. It tracks Google UAE positions in the top 30 for priority 1–2 and live keywords, and shows the week-on-week move.
  - **Who ranks above us:** how often each site sits in the top ten.
  - **Competitor gap:** searches the competitors rank for in the UAE top 20 that we neither rank for nor plan. **Add** puts one in the plan as an idea.
  - Every call checks the monthly budget first and then adds its real cost; a budget of 0 switches everything off.
- **Code:** `src/lib/website/dataforseo-core.ts` (pure, tested) and `dataforseo.ts`. Table `site_keyword_ranks`, site migration 0005.
- **Tests:** `tests/website-seo.test.ts`.

---

## 5. Owner steps, in order

1. **Google Business Profile** for Zeronix Tech:
   - the real office address;
   - primary category "Computer store"; also "Computer wholesaler" and "IT services";
   - website zeronixtech.com, hours, photos, one post a week.
   - Then **Bing Places** (import from Google) and **Apple Business Connect**.
2. **Website › Settings › Brand:**
   - street address exactly as on the Business Profile;
   - opening hours as `Mo-Sa 09:00-19:00`;
   - the Business Profile's map link;
   - add the profile link to Company profiles.
3. **Reviews:** after every delivered order, send the Google review link. Aim for 10+ reviews at 4.5+ within 90 days. Never filter who gets asked.
4. **Settings › Store:** return window in days, matching the Delivery and warranty page.
5. **Production buttons:** Categories › Fill empty pages.
6. **Catalogue cleanup:**
   - add keyboard and warranty on US-part-number products, starting with the top 30;
   - create the Gaming category and move gaming models into it;
   - fix the "512B" typo.
7. **Google Merchant Center** (merchants.google.com):
   - verify zeronixtech.com;
   - shipping: UAE, the same fee as Settings › Store;
   - returns policy;
   - Products › Feeds › add `https://zeronixtech.com/feed/google.xml`, scheduled daily;
   - turn on free listings.
8. **DataForSEO:**
   - make an account and add credit (pay as you go);
   - Settings › DataForSEO: API login, password and budget (start at USD 10);
   - Website › SEO › Rankings: Get volumes, Check rankings now, Competitor gap.
9. **Links that cost nothing:**
   - **zeronix.ae:** link to zeronixtech.com from the header or footer and from relevant pages. This is the strongest link we own.
   - **Listings:** Yellow Pages UAE, Connect.ae, Pricena merchant listing, Dubai Chamber directory, ensun, bizaar.
   - **Profiles:** LinkedIn company page.
   - **Brand partner locators:** Lenovo, HP and Dell, only where Zeronix is a registered partner.
10. **Search Console and Bing Webmaster:** check both show the sitemap; request indexing for the home page, categories, industries and guides (about 10 a day).
11. **Optional:** install claude-seo locally with its DataForSEO extension (location UAE) for a monthly `/seo audit`, `/seo drift compare` and `/seo geo`.

---

## 6. 90 days

| Weeks | Site (Claude) | Content (team) | Off-site (owner) |
|---|---|---|---|
| 1–2 | Done 2026-11-11 (section 4) | Fill category pages; keyboard and warranty on the top 30 products | GBP, Bing Places, Merchant Center, zeronix.ae links |
| 3–4 | Act on the first ranking and gap data | Pillar guide "Business laptops in the UAE: 2026 buying guide for companies"; B2B hub "Corporate laptop supplier in Dubai: what to ask" | Yellow Pages, Connect.ae, Pricena, LinkedIn |
| 5–8 | Rewrite titles of pages Google shows but nobody clicks (SEO › Opportunities) | One guide and one comparison a week: warranty explained, Arabic/English keyboards, new-office IT checklist, workstations for engineering, servers for SMEs | Reviews after every order; two partner or guest mentions |
| 9–12 | Only if the data shows demand: Abu Dhabi and Sharjah pages with genuinely local content; Arabic for the top 3 categories | "UAE business laptop price index", monthly from our own prices: original data that journalists and AI assistants cite | Pitch the index to Gulf News, Khaleej Times, tbreak and gdgtme; short YouTube videos for each guide |

**Writing workflow for every guide** (claude-seo):
1. `/seo cluster` → `/seo content-brief`.
2. Write it answer-first: the first 40–60 words answer the question.
3. Add a comparison table, an FAQ, picks and a byline.
4. Run `/seo geo` and `/seo schema` on the draft.
5. Upload the .md in Website › Content and publish (IndexNow pings automatically).
6. Request indexing in Search Console.

**Measure monthly:**
- Indexed pages: 179 → 400+.
- Keywords on page one (Rankings tab).
- Organic clicks and quote requests from search (Overview).
- Google reviews: 10+.
- AI visibility: ask ChatGPT, Gemini, Claude, Perplexity and Copilot the same 10 questions and note whether we are named (SEO-PLAN.md phase 5).

**Realistic timing:**
- Model, industry and question searches: page one in 1–3 months.
- B2B supplier searches: 2–4 months.
- "Laptops UAE" and other head terms: 12+ months and real authority (links, reviews, brand searches).

---

## 7. claude-seo methods and where each one stands

| Method | Status | Next |
|---|---|---|
| technical, sitemap, images | Done (robots, canonical, 404s, image sitemap, real dates) | Monthly `/seo technical` |
| schema | Organization/OnlineStore (+ComputerStore when hours or map are set), WebSite, Product+Offer (shipping, returns), FAQ, Breadcrumb, Article, Person, ItemList | Real reviews → `aggregateRating` (never invented) |
| ecommerce | Product schema has every field claude-seo asks for except reviews (part number, offer, shipping, returns once set) | Merchant Center, reviews |
| content / E-E-A-T | Bylines, dates, answer-first guides; product copy generated from data | Owner-written summaries for the top 20 sellers |
| geo, agentic | llms.txt, llms-full.txt, AI crawlers allowed | Monthly AI-visibility check; Markdown page copies later |
| local, maps | Settings fields and schema ready | GBP, reviews, citations (owner) |
| backlinks | None yet | zeronix.ae links, directories, price-index PR |
| cluster, content-brief, flow, sxo | Website › SEO plan | Volumes from DataForSEO |
| dataforseo | Built (Rankings tab) | Owner connects an account |
| programmatic | Industries; curated compare pages | Series hubs (ThinkPad, EliteBook) when the catalogue is larger |
| competitor-pages | Compare pages | Guide: "Buying for a company: Zeronix vs Amazon/Noon" |
| hreflang | English only | Arabic when volumes justify it |
| drift | None | Monthly `/seo drift compare` (local claude-seo) |
| google (GSC, GA4) | Daily Search Console import; GA4 on | Merchant Center |
