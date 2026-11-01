import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, primaryKey, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { SiteCheck, SiteFaq, SiteImage, SiteIndustryRole, SitePostProduct, SiteQuoteItem, SiteSeo, SiteSpecTemplate, SiteUaeNotes, SiteUtm } from "@/lib/website/types";

// ---------- Public website: zeronixtech.com (WEBSITE-PLAN.md) ----------
// These tables live in the website's OWN database (zeronix-site-db, SITE_DATABASE_URL), not in the ZeronixOS one, so
// site traffic and content never touch accounts, CRM or procurement. Only the portal's Website code reads them
// (src/db/site.ts); the public site (website/, its own container) reads published rows through /api/site/*.
// A link to a ZeronixOS record (a user, a procurement product, a CRM deal) is a plain id with no foreign key, because
// it points into the other database.

const siteStatus = ["draft", "published", "archived"] as const;

/** A picture for the public site, on its own volume (SITE_FILES_DIR). SiteImage.fileId points here. */
export const siteMedia = pgTable("site_media", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  storedName: text("stored_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  alt: text("alt").notNull().default(""),
  /** Where the picture came from (brand press kit, our photo), for image rights. */
  source: text("source").notNull().default(""),
  /** ZeronixOS users.id of whoever uploaded it. */
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The byline people see (E-E-A-T): made from the uploader's portal user on their first upload, then edited here. */
export const siteAuthors = pgTable("site_authors", {
  id: serial("id").primaryKey(),
  /** ZeronixOS users.id. Posts point at authors through this (sitePosts.authorUserId). */
  portalUserId: integer("portal_user_id").unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  jobTitle: text("job_title").notNull().default(""),
  bio: text("bio").notNull().default(""),
  photo: jsonb("photo").$type<SiteImage>(),
  /** Profiles that prove who they are (LinkedIn...), used as Person.sameAs. */
  links: text("links").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Who the site is for: real estate, design firms, clinics... Each has a hub page and its own guides. */
export const siteIndustries = pgTable("site_industries", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** lucide icon name shown on cards and in the mega menu. */
  icon: text("icon").notNull().default(""),
  /** One line for the industry card and the mega menu. */
  summary: text("summary").notNull().default(""),
  heroTitle: text("hero_title").notNull().default(""),
  /** Card and hero picture. */
  image: jsonb("image").$type<SiteImage>(),
  /** Markdown, and the HTML the portal renders from it (the site never parses Markdown). */
  intro: text("intro").notNull().default(""),
  introHtml: text("intro_html").notNull().default(""),
  painPoints: text("pain_points").array().notNull().default(sql`'{}'::text[]`),
  roles: jsonb("roles").$type<SiteIndustryRole[]>().notNull().default([]),
  faq: jsonb("faq").$type<SiteFaq[]>().notNull().default([]),
  seo: jsonb("seo").$type<SiteSeo>().notNull().default({}),
  sort: integer("sort").notNull().default(0),
  status: text("status", { enum: siteStatus }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Laptops, desktops, workstations, servers... A tree, so a new category is a row and not code. */
export const siteCategories = pgTable("site_categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  icon: text("icon").notNull().default(""),
  description: text("description").notNull().default(""),
  image: jsonb("image").$type<SiteImage>(),
  specTemplate: jsonb("spec_template").$type<SiteSpecTemplate>().notNull().default({ groups: [] }),
  seo: jsonb("seo").$type<SiteSeo>().notNull().default({}),
  sort: integer("sort").notNull().default(0),
  status: text("status", { enum: siteStatus }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteBrands = pgTable("site_brands", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoFileId: integer("logo_file_id").references(() => siteMedia.id, { onDelete: "set null" }),
  website: text("website").notNull().default(""),
  uaeWarrantyNote: text("uae_warranty_note").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  status: text("status", { enum: siteStatus }).notNull().default("draft"),
});

/**
 * One model as the site shows it (UAE part number, specs from the brand's page, who it suits). Price columns wait for
 * the shop (WEBSITE-PLAN.md section 11); until then every product is "price on request".
 */
export const siteProducts = pgTable(
  "site_products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    categoryId: integer("category_id").references(() => siteCategories.id, { onDelete: "set null" }),
    brandId: integer("brand_id").references(() => siteBrands.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    series: text("series").notNull().default(""),
    /** Manufacturer part number, the UAE / Middle East one (#ABV = Arabic/English keyboard). */
    mpn: text("mpn").notNull().default(""),
    summary: text("summary").notNull().default(""),
    summaryHtml: text("summary_html").notNull().default(""),
    images: jsonb("images").$type<SiteImage[]>().notNull().default([]),
    highlights: text("highlights").array().notNull().default(sql`'{}'::text[]`),
    /** Keys follow the category's spec template. */
    specs: jsonb("specs").$type<Record<string, string>>().notNull().default({}),
    uaeAvailable: boolean("uae_available").notNull().default(true),
    uaeNotes: jsonb("uae_notes").$type<SiteUaeNotes>().notNull().default({}),
    /** The brand page the specs were copied from, and when someone last checked them. */
    sourceUrl: text("source_url").notNull().default(""),
    specsCheckedAt: timestamp("specs_checked_at", { withTimezone: true }),
    pros: text("pros").array().notNull().default(sql`'{}'::text[]`),
    cons: text("cons").array().notNull().default(sql`'{}'::text[]`),
    faq: jsonb("faq").$type<SiteFaq[]>().notNull().default([]),
    seo: jsonb("seo").$type<SiteSeo>().notNull().default({}),
    /** ZeronixOS products.id of the same model (supplier prices and stock), for the shop later. */
    portalProductId: integer("portal_product_id"),
    priceMode: text("price_mode", { enum: ["hidden", "on_request", "public"] }).notNull().default("on_request"),
    listPrice: numeric("list_price", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("AED"),
    vatIncluded: boolean("vat_included").notNull().default(true),
    status: text("status", { enum: siteStatus }).notNull().default("draft"),
    /** ZeronixOS users.id. */
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_products_category_idx").on(t.categoryId, t.status), index("site_products_brand_idx").on(t.brandId), index("site_products_mpn_idx").on(t.mpn)],
);

/** RAM / storage / colour options of a product. Empty until the shop needs them. */
export const siteProductVariants = pgTable("site_product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => siteProducts.id, { onDelete: "cascade" }),
  mpn: text("mpn").notNull().default(""),
  label: text("label").notNull(),
  specs: jsonb("specs").$type<Record<string, string>>().notNull().default({}),
  listPrice: numeric("list_price", { precision: 12, scale: 2 }),
  /** ZeronixOS products.id. */
  portalProductId: integer("portal_product_id"),
  sort: integer("sort").notNull().default(0),
});

/** "Best for real estate agents": a product recommended to an industry (and a role in it), in order. */
export const siteProductLinks = pgTable(
  "site_product_links",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => siteProducts.id, { onDelete: "cascade" }),
    industryId: integer("industry_id")
      .notNull()
      .references(() => siteIndustries.id, { onDelete: "cascade" }),
    role: text("role").notNull().default(""),
    label: text("label").notNull().default(""),
    rank: integer("rank").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.industryId, t.role] }), index("site_product_links_industry_idx").on(t.industryId, t.rank)],
);

/** Guides, comparisons, articles and company pages: uploaded as .md (claude-seo), reviewed as a draft, then published. */
export const sitePosts = pgTable(
  "site_posts",
  {
    id: serial("id").primaryKey(),
    type: text("type", { enum: ["guide", "comparison", "article", "industry_page", "page"] }).notNull().default("article"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    metaTitle: text("meta_title").notNull().default(""),
    metaDescription: text("meta_description").notNull().default(""),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    primaryKeyword: text("primary_keyword").notNull().default(""),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    category: text("category").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    industryId: integer("industry_id").references(() => siteIndustries.id, { onDelete: "set null" }),
    categoryId: integer("category_id").references(() => siteCategories.id, { onDelete: "set null" }),
    products: jsonb("products").$type<SitePostProduct[]>().notNull().default([]),
    faq: jsonb("faq").$type<SiteFaq[]>().notNull().default([]),
    schema: jsonb("schema").$type<Record<string, unknown>>(),
    cover: jsonb("cover").$type<SiteImage>(),
    ctaText: text("cta_text").notNull().default(""),
    seoChecks: jsonb("seo_checks").$type<SiteCheck[]>().notNull().default([]),
    /** The uploaded .md file as it came in (site_media). */
    sourceFileId: integer("source_file_id"),
    status: text("status", { enum: ["draft", "scheduled", "published", "archived"] }).notNull().default("draft"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** The byline, as a ZeronixOS users.id: whoever uploaded it (an admin can change it). Its siteAuthors row is the public side. */
    authorUserId: integer("author_user_id"),
    /** ZeronixOS users.id. */
    publishedBy: integer("published_by"),
    reviewNotes: text("review_notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_posts_status_idx").on(t.status, t.publishedAt), index("site_posts_industry_idx").on(t.industryId), index("site_posts_type_idx").on(t.type, t.status)],
);

/** Every upload or edit of a post, so a bad change can be undone. */
export const sitePostRevisions = pgTable(
  "site_post_revisions",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => sitePosts.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    note: text("note").notNull().default(""),
    /** ZeronixOS users.id. */
    userId: integer("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_post_revisions_post_idx").on(t.postId, t.createdAt)],
);

/** Site content that is not a record: brand, home sections, mega menu overrides, footer, default SEO. One row per key. */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  /** ZeronixOS users.id. */
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** "Get B2B pricing" form: arrives filled in with the industry and products, becomes a CRM lead and deal. */
export const siteQuoteRequests = pgTable(
  "site_quote_requests",
  {
    id: serial("id").primaryKey(),
    site: text("site").notNull().default(""),
    industry: text("industry").notNull().default(""),
    items: jsonb("items").$type<SiteQuoteItem[]>().notNull().default([]),
    sourcePage: text("source_page").notNull().default(""),
    cta: text("cta").notNull().default(""),
    name: text("name").notNull(),
    company: text("company").notNull().default(""),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    users: integer("users"),
    budget: text("budget").notNull().default(""),
    timeline: text("timeline").notNull().default(""),
    notes: text("notes").notNull().default(""),
    utm: jsonb("utm").$type<SiteUtm>().notNull().default({}),
    visitorKey: text("visitor_key").notNull().default(""),
    /** First touch: the first page this visitor opened, where they came from, and that source's class (google, ai...). */
    landingPath: text("landing_path").notNull().default(""),
    firstReferrer: text("first_referrer").notNull().default(""),
    source: text("source").notNull().default(""),
    /** ZeronixOS deals.id once converted. */
    dealId: integer("deal_id"),
    status: text("status", { enum: ["new", "converted", "spam"] }).notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_quote_requests_created_idx").on(t.createdAt)],
);

/** Raw tracker events (no cookies, no IP stored), kept 13 months so they can be analysed later. */
export const siteEvents = pgTable(
  "site_events",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(),
    path: text("path").notNull().default(""),
    postId: integer("post_id"),
    productId: integer("product_id"),
    industryId: integer("industry_id"),
    /** A daily-rotating hash, not a cookie: counts visitors without following them. */
    visitorKey: text("visitor_key").notNull().default(""),
    sessionKey: text("session_key").notNull().default(""),
    referrer: text("referrer").notNull().default(""),
    /** The referrer's class: google, bing, ai, social, referral, direct, email, campaign. */
    source: text("source").notNull().default(""),
    utm: jsonb("utm").$type<SiteUtm>(),
    country: text("country").notNull().default(""),
    device: text("device").notNull().default(""),
    /** The link or button (cta_click, click) and a number (scroll %, seconds on page). */
    target: text("target").notNull().default(""),
    value: integer("value"),
  },
  (t) => [
    index("site_events_at_idx").on(t.at),
    index("site_events_post_idx").on(t.postId, t.at),
    index("site_events_type_idx").on(t.type, t.at),
    index("site_events_session_idx").on(t.sessionKey, t.at),
  ],
);

/** Rollups the dashboards read (one row per day, page, traffic source and metric), rebuilt by the worker. */
export const siteDaily = pgTable(
  "site_daily",
  {
    day: date("day").notNull(),
    path: text("path").notNull(),
    source: text("source").notNull().default(""),
    metric: text("metric").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.path, t.source, t.metric] }), index("site_daily_metric_idx").on(t.metric, t.day)],
);

/** Google Search Console rows, imported daily. */
export const siteSearchDaily = pgTable(
  "site_search_daily",
  {
    day: date("day").notNull(),
    page: text("page").notNull(),
    query: text("query").notNull(),
    country: text("country").notNull().default(""),
    device: text("device").notNull().default(""),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    position: real("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.page, t.query, t.country, t.device] }), index("site_search_daily_page_idx").on(t.page, t.day), index("site_search_daily_query_idx").on(t.query, t.day)],
);

/** The SEO plan: keywords we want to rank for, grouped in clusters, each aimed at one page and given a date. */
export const siteKeywords = pgTable(
  "site_keywords",
  {
    id: serial("id").primaryKey(),
    keyword: text("keyword").notNull(),
    cluster: text("cluster").notNull().default(""),
    intent: text("intent", { enum: ["commercial", "transactional", "informational", "navigational"] }).notNull().default("commercial"),
    industryId: integer("industry_id").references(() => siteIndustries.id, { onDelete: "set null" }),
    categoryId: integer("category_id").references(() => siteCategories.id, { onDelete: "set null" }),
    /** 1 = write first, 3 = later. */
    priority: integer("priority").notNull().default(2),
    /** Monthly searches and difficulty (0-100) when a tool gave them; empty from web research alone. */
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    source: text("source", { enum: ["research", "gsc", "csv"] }).notNull().default("research"),
    targetPostId: integer("target_post_id").references(() => sitePosts.id, { onDelete: "set null" }),
    /** The page it should land on when that page is not a post (an industry hub, a category). */
    targetPath: text("target_path").notNull().default(""),
    status: text("status", { enum: ["idea", "planned", "writing", "draft", "published"] }).notNull().default("idea"),
    plannedFor: date("planned_for"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("site_keywords_keyword_uq").on(sql`lower(${t.keyword})`), index("site_keywords_cluster_idx").on(t.cluster), index("site_keywords_status_idx").on(t.status, t.plannedFor)],
);
