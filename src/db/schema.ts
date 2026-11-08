import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  pgPolicy,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ChatCard } from "@/lib/chat/types";
import type { WebClientInfo, WebGeo, WebPageVisit, WebSiteEvent } from "@/lib/webchat/types";
import type { OfferDraft } from "@/lib/llm/schema";
import type { SellerSnapshot } from "@/lib/seller-types";

/**
 * Organisations (tenants). Row 1 is Zeronix. Every new table carries organization_id, and the accounting tables also get
 * the org_isolation row-level-security policy (see lib/org.ts). The policies only bite once the app connects as a
 * non-owner database role (Phase T in the accounts plan); today it connects as the owner, so they change nothing.
 * Our TRN stays in settings (quote_trn) and the trade licence in brand_profile: read them through orgProfile().
 */
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull().default(""),
  /** ISO country code: decides the tax regime and chart-of-accounts template. */
  country: text("country").notNull().default("AE"),
  baseCurrency: text("base_currency").notNull().default("AED"),
  taxRegime: text("tax_regime", { enum: ["AE_VAT", "IN_GST"] }).notNull().default("AE_VAT"),
  /** UAE: emirate of the fixed establishment, where standard-rated sales are reported (VAT 201 box 1). */
  emirate: text("emirate").notNull().default("dubai"),
  /** 1 = January (UAE); India runs April to March (4). */
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  timezone: text("timezone").notNull().default("Asia/Dubai"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The organisation a row belongs to. Default 1 (Zeronix) until there is more than one. */
const orgId = () =>
  integer("organization_id")
    .notNull()
    .default(1)
    .references(() => organizations.id);

/** Row-level security for a tenant table: rows of the organisation set by withOrg() (app.org_id) only. */
const orgPolicy = () =>
  pgPolicy("org_isolation", {
    for: "all",
    using: sql`organization_id = nullif(current_setting('app.org_id', true), '')::int`,
    withCheck: sql`organization_id = nullif(current_setting('app.org_id', true), '')::int`,
  });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: orgId(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "sales"] }).notNull().default("sales"),
  isActive: boolean("is_active").notNull().default(true),
  /** Apps this user may open (keys from lib/apps.ts). NULL = the role's defaults. Admins always see everything. */
  apps: text("apps").array(),
  /** Which sales records they see: "own" = deals they are assigned to (and what hangs off them), "all" = everyone's. Admins always see all. */
  dataScope: text("data_scope", { enum: ["own", "all"] }).notNull().default("own"),
  /** Accountant work in the Accounts app: journals, chart of accounts, reconciliation, VAT filing, lock date. Admins always. */
  isAccountant: boolean("is_accountant").notNull().default(false),
  /** Shown in the email signature. */
  jobTitle: text("job_title").notNull().default(""),
  phone: text("phone").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  organizationId: orgId(),
  name: text("name").notNull().unique(),
  contactName: text("contact_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  /** Market category, see lib/supplier-types.ts (distributor, market, dafza, jafza ...). */
  type: text("type").notNull().default("other"),
  /** Currency this supplier normally quotes in; pre-selected when importing their list. */
  defaultCurrency: text("default_currency").notNull().default("AED"),
  notes: text("notes").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  // what Accounts needs to pay them (Purchases); the same supplier as in Procurement, never a copy
  trn: text("trn").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  /** Days we have to pay their bills (0 = cash). */
  termsDays: integer("terms_days").notNull().default(30),
  bankName: text("bank_name").notNull().default(""),
  iban: text("iban").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A supplier who publishes their stock sheet at a link (e.g. a published Google Sheet). The background
 * scheduler re-reads it every `intervalMinutes` and saves a new price list only when the sheet changed.
 */
export const supplierFeeds = pgTable("supplier_feeds", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .unique()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  /** The link the user pasted (a web page or the sheet itself). */
  url: text("url").notNull(),
  /** The CSV address found behind `url`; empty until the first successful read. */
  resolvedUrl: text("resolved_url").notNull().default(""),
  /** Used when the sheet shows no currency symbol. */
  currency: text("currency").notNull().default("USD"),
  intervalMinutes: integer("interval_minutes").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
  /** Hash of the sheet text at the last successful sync; same hash = nothing to do. */
  lastHash: text("last_hash").notNull().default(""),
  lastRows: integer("last_rows").notNull().default(0),
  lastStatus: text("last_status", { enum: ["never", "unchanged", "updated", "error"] }).notNull().default("never"),
  lastMessage: text("last_message").notNull().default(""),
  lastPriceListId: integer("last_price_list_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceLists = pgTable(
  "price_lists",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    rawText: text("raw_text").notNull(),
    /** How the list arrived: pasted WhatsApp text, an uploaded Excel sheet, or a supplier's live feed link. */
    source: text("source", { enum: ["paste", "excel", "feed"] }).notNull().default("paste"),
    /** Original file name for Excel imports; the feed link for live-feed syncs. */
    sourceName: text("source_name").notNull().default(""),
    status: text("status", { enum: ["queued", "parsing", "review", "saved", "failed"] })
      .notNull()
      .default("queued"),
    progressDone: integer("progress_done").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
    /** Blocks copied from this supplier's earlier reviewed lists instead of being read by the AI. */
    reusedBlocks: integer("reused_blocks").notNull().default(0),
    error: text("error"),
    model: text("model"),
    parseMs: integer("parse_ms"),
    /** Parsed rows waiting for review; cleared once saved. */
    drafts: jsonb("drafts").$type<OfferDraft[]>(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    savedAt: timestamp("saved_at", { withTimezone: true }),
  },
  (t) => [index("price_lists_supplier_idx").on(t.supplierId, t.receivedAt)],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    category: text("category").notNull(),
    brand: text("brand").notNull(),
    modelName: text("model_name").notNull(),
    partNumber: text("part_number").notNull().default(""),
    /** Normalised part number for exact lookups ("15-FD0130WM" -> "15fd0130wm"). */
    partNorm: text("part_norm").notNull().default(""),
    cpu: text("cpu").notNull().default(""),
    ramGb: integer("ram_gb"),
    storage: text("storage").notNull().default(""),
    specSummary: text("spec_summary").notNull().default(""),
    matchKey: text("match_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_part_norm_idx").on(t.brand, t.partNorm),
    index("products_model_trgm").using("gin", t.modelName.op("gin_trgm_ops")),
    index("products_part_trgm").using("gin", t.partNumber.op("gin_trgm_ops")),
  ],
);

/** Alternate match keys that point at an existing product (learned when a user merges in review). */
export const productAliases = pgTable(
  "product_aliases",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    matchKey: text("match_key").notNull(),
  },
  (t) => [uniqueIndex("product_aliases_key_idx").on(t.matchKey)],
);

export const offers = pgTable(
  "offers",
  {
    id: serial("id").primaryKey(),
    priceListId: integer("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
    productId: integer("product_id").notNull().references(() => products.id),
    category: text("category").notNull(),
    brand: text("brand").notNull(),
    modelName: text("model_name").notNull(),
    partNumber: text("part_number").notNull().default(""),
    cpu: text("cpu").notNull().default(""),
    ramGb: integer("ram_gb"),
    storage: text("storage").notNull().default(""),
    display: text("display").notNull().default(""),
    gpu: text("gpu").notNull().default(""),
    os: text("os").notNull().default(""),
    extras: text("extras").notNull().default(""),
    condition: text("condition").notNull().default("new"),
    price: numeric("price", { precision: 12, scale: 2, mode: "number" }),
    currency: text("currency").notNull().default("AED"),
    /** What the price includes / is quoted on: "FOB JA", "ex-VAT", "" (delivered, as quoted). */
    priceBasis: text("price_basis").notNull().default(""),
    stockNote: text("stock_note").notNull().default(""),
    rawText: text("raw_text").notNull().default(""),
    confidence: real("confidence").notNull().default(1),
    /** Lower-case alphanumeric blob of every field, for fast "contains" search. */
    searchNorm: text("search_norm").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("offers_product_idx").on(t.productId, t.receivedAt),
    index("offers_supplier_idx").on(t.supplierId, t.receivedAt),
    index("offers_search_trgm").using("gin", t.searchNorm.op("gin_trgm_ops")),
  ],
);

/** Reviewed corrections reused as few-shot examples for the same supplier. */
export const parseCorrections = pgTable(
  "parse_corrections",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    output: text("output").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parse_corrections_supplier_idx").on(t.supplierId, t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/** A to-do for one person. `relatedType`/`relatedId` link it to a deal or company once Sales exists. */
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    /** Calendar day (UAE) it is due; null = no date. */
    dueDate: date("due_date"),
    priority: text("priority", { enum: ["normal", "high"] }).notNull().default("normal"),
    status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
    assignedTo: integer("assigned_to")
      .notNull()
      .references(() => users.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    relatedType: text("related_type"),
    relatedId: integer("related_id"),
    /** Project checklist only (related_type "project"): its group (lib/projects.ts CHECKLIST_GROUPS), order inside the group, */
    checklistGroup: text("checklist_group"),
    position: integer("position"),
    /** must be done before the project can be marked completed, */
    required: boolean("required").notNull().default(false),
    /** and days after the project start (work, handover) or after the project was opened (survey) it is due. */
    offsetDays: integer("offset_days"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assignedTo, t.status, t.dueDate)],
);

/** One user's mailbox, read over IMAP by the background worker. The password is encrypted (see lib/crypto.ts). */
export const mailAccounts = pgTable("mail_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Login name for the mailbox, normally the full address. */
  imapUser: text("imap_user").notNull(),
  passwordEnc: text("password_enc").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastStatus: text("last_status", { enum: ["never", "ok", "error"] }).notNull().default("never"),
  lastError: text("last_error").notNull().default(""),
  /** Mailbox "UIDVALIDITY": when it changes the mailbox was rebuilt and the saved list is dropped. */
  uidValidity: text("uid_validity").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The newest messages in a user's inbox: sender, subject, time and read state only (no message body is stored). */
export const mailMessages = pgTable(
  "mail_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    uid: integer("uid").notNull(),
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull().default(""),
    subject: text("subject").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    seen: boolean("seen").notNull().default(false),
  },
  (t) => [uniqueIndex("mail_messages_user_uid_idx").on(t.userId, t.uid), index("mail_messages_recent_idx").on(t.userId, t.receivedAt)],
);

/** Company branding used in email signatures. One row (id = 1), edited by an admin. */
export const brandProfile = pgTable("brand_profile", {
  id: integer("id").primaryKey(),
  company: text("company").notNull().default("Zeronix"),
  tagline: text("tagline").notNull().default(""),
  address: text("address").notNull().default(""),
  website: text("website").notNull().default(""),
  mainPhone: text("main_phone").notNull().default(""),
  /** Where the logo sits in the signature. */
  layout: text("layout", { enum: ["left", "right", "top", "below"] }).notNull().default("left"),
  color: text("color").notNull().default("#2a78d6"),
  disclaimer: text("disclaimer").notNull().default(""),
  /** Logo as base64 (PNG, JPG or WebP, small). Empty = text mark. */
  logoB64: text("logo_b64").notNull().default(""),
  logoMime: text("logo_mime").notNull().default(""),
  /** Template, divider line, fonts, colours and the corporate-template text lines (BrandStyle in lib/signature.ts). */
  style: jsonb("style").$type<Record<string, unknown>>().notNull().default({}),
  // ---- customer documents (proposals, quotes): contact lines, and images an admin uploads ----
  docEmail: text("doc_email").notNull().default(""),
  /** All phone numbers as printed, e.g. "+971 50 981 1669 / +971 55 824 6066". */
  docPhones: text("doc_phones").notNull().default(""),
  tradeLicense: text("trade_license").notNull().default(""),
  /** The logo in white, for the dark proposal cover. */
  logoDarkB64: text("logo_dark_b64").notNull().default(""),
  logoDarkMime: text("logo_dark_mime").notNull().default(""),
  /** The authorised signatory's signature and the company stamp, printed on proposals (PNG with a transparent background). */
  signatureB64: text("signature_b64").notNull().default(""),
  signatureMime: text("signature_mime").notNull().default(""),
  stampB64: text("stamp_b64").notNull().default(""),
  stampMime: text("stamp_mime").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every email sent from the portal: who, to how many people, and when. Used for the daily send limit and, later, the CRM timeline. */
export const mailSentLog = pgTable(
  "mail_sent_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toAddresses: text("to_addresses").notNull().default(""),
    subject: text("subject").notNull().default(""),
    messageId: text("message_id").notNull().default(""),
    recipients: integer("recipients").notNull().default(1),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mail_sent_user_idx").on(t.userId, t.sentAt)],
);

// ---------- Sales ----------

/** A customer or prospect company. */
export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    name: text("name").notNull(),
    /** Lower-case name without spaces/punctuation, to spot duplicates ("ABC Trading LLC" = "abc trading llc"). */
    nameNorm: text("name_norm").notNull(),
    industry: text("industry").notNull().default(""),
    emirate: text("emirate").notNull().default(""),
    website: text("website").notNull().default(""),
    phone: text("phone").notNull().default(""),
    tradeLicenseNo: text("trade_license_no").notNull().default(""),
    trn: text("trn").notNull().default(""),
    /** Billing address printed on invoices (an order's delivery address wins when it has one). */
    address: text("address").notNull().default(""),
    /** Where we first found them (see lib/sales.ts SOURCES). */
    source: text("source").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** Added as a customer in Accounts, before any deal or order. Others become customers by winning a deal or getting an order. */
    isCustomer: boolean("is_customer").notNull().default(false),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("companies_name_norm_idx").on(t.nameNorm)],
);

/**
 * Everyone who looks after a customer, in display order. The first one is also stored as companies.owner_id (the main
 * owner); a company with no rows here falls back to that column alone.
 */
export const companyOwners = pgTable(
  "company_owners",
  {
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.userId] }), index("company_owners_user_idx").on(t.userId)],
);

/** A person at a company. */
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jobTitle: text("job_title").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    whatsapp: text("whatsapp").notNull().default(""),
    isDecisionMaker: boolean("is_decision_maker").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contacts_company_idx").on(t.companyId), index("contacts_email_idx").on(t.email)],
);

/** One opportunity. A lead is simply a deal at stage "new". */
export const deals = pgTable(
  "deals",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** Stage key from lib/sales.ts STAGES. */
    stage: text("stage").notNull().default("new"),
    /** "product" = a supply deal; "project" = site work (CCTV, cabling...) with a row in `projects` (Projects app). */
    kind: text("kind", { enum: ["product", "project"] }).notNull().default("product"),
    source: text("source").notNull().default(""),
    /** What the customer asked for, in their words. */
    requirement: text("requirement").notNull().default(""),
    /** Estimated value in AED. */
    valueAed: numeric("value_aed", { precision: 14, scale: 2, mode: "number" }),
    expectedClose: date("expected_close"),
    /** When the salesman means to follow up next (optional). Alerts use it when it comes before the stage's time limit. */
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    lostReason: text("lost_reason").notNull().default(""),
    /** The genuine-lead checklist (see lib/sales.ts CHECKS). */
    checks: jsonb("checks").$type<Record<string, boolean>>().notNull().default({}),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    /** When it was marked won or lost. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deals_stage_idx").on(t.stage), index("deals_owner_idx").on(t.ownerId), index("deals_company_idx").on(t.companyId)],
);

/** The timeline of a deal: calls, messages, emails, meetings, notes and stage changes. */
export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    /** call, whatsapp, email, meeting, note, stage, created */
    type: text("type").notNull(),
    body: text("body").notNull().default(""),
    dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_deal_idx").on(t.dealId, t.at), index("activities_company_idx").on(t.companyId, t.at)],
);

/** Everyone working on a deal, in display order. The first one is also stored as deals.owner_id (the main owner). */
export const dealAssignees = pgTable(
  "deal_assignees",
  {
    dealId: integer("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.userId] }), index("deal_assignees_user_idx").on(t.userId)],
);

// ---------- Quotes ----------

/** What the customer wants, line by line, with our cost and selling price (all in AED). The base for a quote. */
export const dealItems = pgTable(
  "deal_items",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "set null" }),
    /** Who we would buy it from, copied when the price was picked (stays even if the price list is deleted). */
    supplierName: text("supplier_name").notNull().default(""),
    /** Our buying price per unit in AED. Empty when typed by hand without a cost. */
    costAed: numeric("cost_aed", { precision: 14, scale: 2, mode: "number" }),
    marginPct: numeric("margin_pct", { precision: 6, scale: 2, mode: "number" }),
    /** Selling price per unit in AED, before VAT. */
    unitPriceAed: numeric("unit_price_aed", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** Project BOQ only: the group heading (e.g. "Cabling & accessories"); "" for product deals. */
    section: text("section").notNull().default(""),
    /** nos, m, lot, day... (see lib/boq.ts); "" = pieces, not shown. */
    unit: text("unit").notNull().default(""),
    /** material, labour, service, lump_sum (lib/boq.ts). Only materials come from supplier prices. */
    lineType: text("line_type").notNull().default("material"),
    /** An optional extra: shown on the proposal, left out of the quote and its total. */
    optional: boolean("optional").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deal_items_deal_idx").on(t.dealId, t.position)],
);

/** A quotation sent to a customer. Its lines are a copy, so later price changes never alter a sent quote. */
export const quotes = pgTable(
  "quotes",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    /** ZQ-2026-0001: the year and a running number that restarts every year. */
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    /** The CRM deal it was made for; empty for an instant quote to a customer (Sales › Quotes › New quote). */
    dealId: integer("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    /** The customer, always set (the deal's company when there is a deal). */
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** The salesperson the quote is in the name of (may differ from who typed it). */
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Payment terms offered, in days after the invoice (0 = cash); carried to the order. */
    termsDays: integer("terms_days"),
    /** Inside the company only, never printed. */
    notes: text("notes").notNull().default(""),
    /** draft, sent, accepted, rejected, expired */
    status: text("status").notNull().default("draft"),
    validUntil: date("valid_until").notNull(),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(5),
    terms: text("terms").notNull().default(""),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** Our cost of the lines that had one, to show the profit inside the portal (never printed). */
    costTotal: numeric("cost_total", { precision: 14, scale: 2, mode: "number" }),
    /** What the lines with a cost sell for: profit = soldWithCost - costTotal, never subtotal - costTotal. */
    soldWithCost: numeric("sold_with_cost", { precision: 14, scale: 2, mode: "number" }),
    /** Lines with no cost: the profit then covers only part of the quote. */
    uncostedLines: integer("uncosted_lines").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("quotes_year_seq_idx").on(t.year, t.seq), index("quotes_deal_idx").on(t.dealId), index("quotes_status_idx").on(t.status), index("quotes_company_idx").on(t.companyId), index("quotes_owner_idx").on(t.ownerId)],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: serial("id").primaryKey(),
    quoteId: integer("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** Copied from the project BOQ: section heading and unit ("" on product quotes). */
    section: text("section").notNull().default(""),
    unit: text("unit").notNull().default(""),
    /** Our cost per unit (AED) and who from, so the quote can be edited with its margin; never printed. */
    costAed: numeric("cost_aed", { precision: 14, scale: 2, mode: "number" }),
    supplierName: text("supplier_name").notNull().default(""),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId, t.position)],
);

/**
 * One work session: punched in, then (later) punched out. `day` is the UAE calendar day of the punch-in.
 * A reason is kept when someone punches in late or leaves inside working hours (see lib/attendance.ts).
 */
export const attendancePunches = pgTable(
  "attendance_punches",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    day: date("day").notNull(),
    inAt: timestamp("in_at", { withTimezone: true }).notNull().defaultNow(),
    outAt: timestamp("out_at", { withTimezone: true }),
    /** Punched in after the start time (outside the break). */
    late: boolean("late").notNull().default(false),
    inReason: text("in_reason").notNull().default(""),
    /** Punched out before the end time (outside the break). */
    early: boolean("early").notNull().default(false),
    outReason: text("out_reason").notNull().default(""),
    /** True when the system closed a session nobody punched out of. */
    autoClosed: boolean("auto_closed").notNull().default(false),
  },
  (t) => [index("attendance_punches_user_day_idx").on(t.userId, t.day)],
);

/** A day someone was away for a known reason. Only shows on days without a punch. */
export const attendanceAbsences = pgTable(
  "attendance_absences",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    day: date("day").notNull(),
    kind: text("kind", { enum: ["medical", "other"] }).notNull(),
    note: text("note").notNull().default(""),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** Wrong passwords, kept to lock an email for a while after too many tries (see lib/auth/lockout.ts). */
export const loginFailures = pgTable(
  "login_failures",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    ip: text("ip").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_failures_email_idx").on(t.email, t.at)],
);

/**
 * A confirmed order, made from a quote the customer accepted (one order per quote). The lines are copied from the quote.
 * One delivery and one invoice per order for now: the delivery note number and date live on the order itself.
 */
export const salesOrders = pgTable(
  "sales_orders",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    /** ZSO-2026-0001 */
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    /** One live order per quote; a cancelled order frees the quote (sales_orders_live_quote_idx). */
    quoteId: integer("quote_id")
      .notNull()
      .references(() => quotes.id),
    /** Empty when it came from an instant quote (no CRM deal). */
    dealId: integer("deal_id").references(() => deals.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** The customer's LPO / PO number and date. */
    customerRef: text("customer_ref").notNull().default(""),
    customerRefDate: date("customer_ref_date"),
    /** Days the customer has to pay after the invoice date (0 = cash / on delivery). */
    termsDays: integer("terms_days").notNull().default(30),
    /** open, delivered, invoiced, cancelled */
    status: text("status").notNull().default("open"),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    costTotal: numeric("cost_total", { precision: 14, scale: 2, mode: "number" }),
    /** Copied from the quote (see quotes.soldWithCost). */
    soldWithCost: numeric("sold_with_cost", { precision: 14, scale: 2, mode: "number" }),
    uncostedLines: integer("uncosted_lines").notNull().default(0),
    deliveryAddress: text("delivery_address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** ZDN-2026-0001, given when the goods are delivered. */
    dnYear: integer("dn_year"),
    dnSeq: integer("dn_seq"),
    dnNumber: text("dn_number").unique(),
    deliveredOn: date("delivered_on"),
    receivedBy: text("received_by").notNull().default(""),
    cancelReason: text("cancel_reason").notNull().default(""),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sales_orders_year_seq_idx").on(t.year, t.seq),
    uniqueIndex("sales_orders_dn_year_seq_idx").on(t.dnYear, t.dnSeq),
    uniqueIndex("sales_orders_live_quote_idx").on(t.quoteId).where(sql`status <> 'cancelled'`),
    index("sales_orders_quote_idx").on(t.quoteId),
    index("sales_orders_status_idx").on(t.status),
    index("sales_orders_company_idx").on(t.companyId),
  ],
);

export const salesOrderItems = pgTable(
  "sales_order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [index("sales_order_items_order_idx").on(t.orderId, t.position)],
);

/**
 * A tax invoice. Never edited after it is issued: a mistake is cancelled with a credit note. The number comes from the
 * Admin series (prefix + next number) so it can continue the numbers used before the portal. The customer name and
 * TRN are copied at issue, as the details must be the ones of that day.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    number: text("number").notNull().unique(),
    /**
     * "sale": issued here, from an order, from a quote or typed directly. "opening": a customer invoice still unpaid when
     * the portal took over from Zoho, kept with Zoho's number and total, no lines, no order; it counts in what customers
     * owe but not in sales or VAT.
     */
    kind: text("kind", { enum: ["sale", "opening"] }).notNull().default("sale"),
    /** One active (not cancelled) invoice per order; a cancelled one is followed by a new one. Empty for direct and opening invoices. */
    orderId: integer("order_id").references(() => salesOrders.id),
    /** The quote a direct invoice was made from (an order keeps its own link to its quote). */
    quoteId: integer("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    dealId: integer("deal_id").references(() => deals.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    issueDate: date("issue_date").notNull(),
    supplyDate: date("supply_date").notNull(),
    termsDays: integer("terms_days").notNull(),
    dueDate: date("due_date").notNull(),
    customerName: text("customer_name").notNull(),
    customerAddress: text("customer_address").notNull().default(""),
    customerTrn: text("customer_trn").notNull().default(""),
    /** Our name, address, TRN and bank as they were when it was issued (lib/seller.ts); null on older documents. */
    sellerSnapshot: jsonb("seller_snapshot").$type<SellerSnapshot>(),
    customerRef: text("customer_ref").notNull().default(""),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** What its credit notes have given back so far, before VAT and with VAT. What the customer owes is total less this and less what they paid. */
    creditedNet: numeric("credited_net", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    creditedTotal: numeric("credited_total", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** issued, cancelled */
    status: text("status").notNull().default("issued"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_company_idx").on(t.companyId), index("invoices_due_idx").on(t.status, t.dueDate), index("invoices_order_idx").on(t.orderId), uniqueIndex("invoices_live_order_idx").on(t.orderId).where(sql`status <> 'cancelled' AND order_id IS NOT NULL`), uniqueIndex("invoices_live_quote_idx").on(t.quoteId).where(sql`status <> 'cancelled' AND quote_id IS NOT NULL AND order_id IS NULL`)],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 12, scale: 2, mode: "number" }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** Decides the sales account: Sales, products or Sales, services. */
    lineKind: text("line_kind", { enum: ["product", "service"] }).notNull().default("product"),
    /** VAT code of this line (lib/tax/ae-vat.ts): decides its rate and the VAT 201 box. */
    taxCode: text("tax_code").notNull().default("SR"),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId, t.position)],
);

/** Gives back all or part of an invoice (ZCN-2026-0001). An invoice can have several; when they reach its whole value it is cancelled. */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    issueDate: date("issue_date").notNull(),
    reason: text("reason").notNull(),
    /** The goods are coming back: their cost returns to stock. False: the customer keeps them, or it was a service. */
    goodsBack: boolean("goods_back").notNull().default(true),
    /** What the goods coming back cost, returned to stock. Empty on a note cancelling a whole invoice: every cost it moved goes back. */
    goodsCost: numeric("goods_cost", { precision: 14, scale: 2, mode: "number" }),
    /** The day the goods came back or the price was agreed: the note is due within 14 days of it. Empty on older notes. */
    eventDate: date("event_date"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("credit_notes_year_seq_idx").on(t.year, t.seq), index("credit_notes_invoice_idx").on(t.invoiceId)],
);

/** What a credit note gives back, line by line: all or part of an invoice line, at its price or at a lower one. */
export const creditNoteItems = pgTable(
  "credit_note_items",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    creditNoteId: integer("credit_note_id")
      .notNull()
      .references(() => creditNotes.id, { onDelete: "cascade" }),
    invoiceItemId: integer("invoice_item_id").references(() => invoiceItems.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 12, scale: 2, mode: "number" }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull(),
    lineKind: text("line_kind", { enum: ["product", "service"] }).notNull().default("product"),
    taxCode: text("tax_code").notNull().default("SR"),
  },
  (t) => [index("credit_note_items_note_idx").on(t.creditNoteId, t.position), index("credit_note_items_item_idx").on(t.invoiceItemId), orgPolicy()],
);

/**
 * Money received from a customer (ZRV-2026-0001 receipt), cash or bank transfer. What it paid is in payment_allocations:
 * one invoice, several, or none yet (the rest is an advance). A wrong entry is voided with a reason, never deleted, so
 * the receipt numbers stay complete.
 */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    /** Our name, address, TRN and bank as they were when it was issued (lib/seller.ts); null on older documents. */
    sellerSnapshot: jsonb("seller_snapshot").$type<SellerSnapshot>(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    /** Only on receipts from before allocations existed. Read payment_allocations instead. */
    invoiceId: integer("invoice_id").references(() => invoices.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    paidOn: date("paid_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** cash, bank */
    method: text("method").notNull(),
    /** The cash box or bank account the money went into / came out of (the ledger posts there). Null = the default of its method. */
    bankAccountId: integer("bank_account_id").references((): AnyPgColumn => bankAccounts.id),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payments_year_seq_idx").on(t.year, t.seq), index("payments_invoice_idx").on(t.invoiceId), index("payments_company_idx").on(t.companyId)],
);

/** How much of a receipt went to which invoice. Applying an advance later adds a row with its own date; taking one off voids the row. */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    paymentId: integer("payment_id")
      .notNull()
      .references(() => payments.id),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    appliedOn: date("applied_on").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_allocations_payment_idx").on(t.paymentId), index("payment_allocations_invoice_idx").on(t.invoiceId), orgPolicy()],
);

/**
 * Money we owe or spent (Accounts › Purchases), our number ZBL-2026-0001:
 * - `bill`: a supplier's invoice, paid later (part or full);
 * - `expense`: paid on the spot (rent, fuel, salaries...), saved together with its payment;
 * - `opening`: a supplier bill still unpaid when the portal took over from Zoho (kept out of profit and VAT).
 * A wrong entry is voided with a reason, never deleted. Linked to a customer order, its cost counts against that order.
 */
export const bills = pgTable(
  "bills",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    kind: text("kind", { enum: ["bill", "expense", "opening"] }).notNull().default("bill"),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    /** Who was paid when there is no supplier record (landlord, DEWA, a staff member). */
    paidTo: text("paid_to").notNull().default(""),
    /** The supplier's own invoice number. */
    supplierRef: text("supplier_ref").notNull().default(""),
    billDate: date("bill_date").notNull(),
    termsDays: integer("terms_days").notNull().default(0),
    dueDate: date("due_date").notNull(),
    /** Key from lib/purchases.ts CATEGORIES. */
    category: text("category").notNull(),
    orderId: integer("order_id").references(() => salesOrders.id),
    /** Bought for a direct invoice, which has no order. */
    invoiceId: integer("invoice_id").references(() => invoices.id),
    dealId: integer("deal_id").references(() => deals.id),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** What its debit notes have taken off so far, before VAT and with VAT. */
    creditedNet: numeric("credited_net", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    creditedTotal: numeric("credited_total", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    /** open, void */
    status: text("status").notNull().default("open"),
    voidReason: text("void_reason").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bills_year_seq_idx").on(t.year, t.seq),
    // the same supplier invoice cannot be entered twice
    uniqueIndex("bills_supplier_ref_idx").on(t.supplierId, t.supplierRef).where(sql`supplier_ref <> '' AND status <> 'void'`),
    index("bills_supplier_idx").on(t.supplierId),
    index("bills_due_idx").on(t.status, t.dueDate),
    index("bills_order_idx").on(t.orderId),
    index("bills_invoice_idx").on(t.invoiceId),
    index("bills_date_idx").on(t.billDate),
  ],
);

export const billItems = pgTable(
  "bill_items",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 12, scale: 2, mode: "number" }).notNull().default(1),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** VAT code of this line (lib/tax/ae-vat.ts). */
    taxCode: text("tax_code").notNull().default("SR"),
  },
  (t) => [index("bill_items_bill_idx").on(t.billId, t.position)],
);

/**
 * A filed VAT return: the boxes as they were filed, so later changes cannot alter it. A period not filed yet has no row:
 * its return is worked out live from the ledger. Undone, it stays here with the reason.
 */
export const vatReturns = pgTable(
  "vat_returns",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** The return as filed (lib/tax/vat201.ts). */
    boxes: jsonb("boxes").notNull(),
    payable: numeric("payable", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** The FTA's reference for the filing. */
    reference: text("reference").notNull().default(""),
    /** The lock date before filing: undoing the filing puts it back. */
    previousLockDate: date("previous_lock_date"),
    filedBy: integer("filed_by").references(() => users.id, { onDelete: "set null" }),
    filedAt: timestamp("filed_at", { withTimezone: true }).notNull().defaultNow(),
    paidOn: date("paid_on"),
    paymentReference: text("payment_reference").notNull().default(""),
    bankAccountId: integer("bank_account_id").references((): AnyPgColumn => bankAccounts.id),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoReason: text("undo_reason").notNull().default(""),
  },
  (t) => [uniqueIndex("vat_returns_period_uq").on(t.organizationId, t.periodEnd).where(sql`undone_at IS NULL`), orgPolicy()],
);

/** Goods sent back to a supplier, or a price they reduced (ZDB-2026-0001): takes the cost and the VAT we reclaim off a bill. */
export const debitNotes = pgTable(
  "debit_notes",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id),
    issueDate: date("issue_date").notNull(),
    reason: text("reason").notNull(),
    /** The credit note number on the supplier's own document, if they sent one. */
    supplierRef: text("supplier_ref").notNull().default(""),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("debit_notes_year_seq_idx").on(t.year, t.seq), index("debit_notes_bill_idx").on(t.billId), orgPolicy()],
);

export const debitNoteItems = pgTable(
  "debit_note_items",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    debitNoteId: integer("debit_note_id")
      .notNull()
      .references(() => debitNotes.id, { onDelete: "cascade" }),
    billItemId: integer("bill_item_id").references(() => billItems.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 12, scale: 2, mode: "number" }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2, mode: "number" }).notNull(),
    taxCode: text("tax_code").notNull().default("SR"),
  },
  (t) => [index("debit_note_items_note_idx").on(t.debitNoteId, t.position), index("debit_note_items_item_idx").on(t.billItemId), orgPolicy()],
);

/**
 * An advance handed back (ZRF-2026-0001): to a customer, or by a supplier to us. It comes out of one receipt or voucher,
 * which then has that much less left to apply. Voided with a reason, never deleted.
 */
export const advanceRefunds = pgTable(
  "advance_refunds",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    party: text("party", { enum: ["customer", "supplier"] }).notNull(),
    paymentId: integer("payment_id").references(() => payments.id),
    supplierPaymentId: integer("supplier_payment_id").references((): AnyPgColumn => supplierPayments.id),
    refundedOn: date("refunded_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** cash, bank */
    method: text("method").notNull(),
    bankAccountId: integer("bank_account_id").references((): AnyPgColumn => bankAccounts.id),
    reference: text("reference").notNull().default(""),
    reason: text("reason").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("advance_refunds_year_seq_idx").on(t.year, t.seq), index("advance_refunds_payment_idx").on(t.paymentId), index("advance_refunds_supplier_payment_idx").on(t.supplierPaymentId), orgPolicy()],
);

/**
 * Money paid out (payment voucher ZPV-2026-0001). What it paid is in supplier_payment_allocations: one bill or expense,
 * several, or none yet (the rest is an advance to the supplier). Voided with a reason, never deleted.
 */
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    /** Our name, address, TRN and bank as they were when it was issued (lib/seller.ts); null on older documents. */
    sellerSnapshot: jsonb("seller_snapshot").$type<SellerSnapshot>(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    /** Only on vouchers from before allocations existed. Read supplier_payment_allocations instead. */
    billId: integer("bill_id").references(() => bills.id),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    /** Who was paid when there is no supplier record (an expense to a landlord, DEWA, a staff member). */
    paidTo: text("paid_to").notNull().default(""),
    paidOn: date("paid_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** cash, bank */
    method: text("method").notNull(),
    /** The cash box or bank account the money went into / came out of (the ledger posts there). Null = the default of its method. */
    bankAccountId: integer("bank_account_id").references((): AnyPgColumn => bankAccounts.id),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("supplier_payments_year_seq_idx").on(t.year, t.seq), index("supplier_payments_bill_idx").on(t.billId), index("supplier_payments_supplier_idx").on(t.supplierId)],
);

/** How much of a voucher went to which bill. Works like payment_allocations. */
export const supplierPaymentAllocations = pgTable(
  "supplier_payment_allocations",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    paymentId: integer("payment_id")
      .notNull()
      .references(() => supplierPayments.id),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    appliedOn: date("applied_on").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("supplier_payment_allocations_payment_idx").on(t.paymentId), index("supplier_payment_allocations_bill_idx").on(t.billId), orgPolicy()],
);

/**
 * The company shared documents (Files app): LPOs, signed delivery notes, licences, supplier lists... The file itself sits
 * on disk under FILES_DIR with a random name; this row is what people see. It can be linked to a company, deal, order or
 * invoice so it shows there too.
 */
export const files = pgTable(
  "files",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    storedName: text("stored_name").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    folder: text("folder").notNull().default("other"),
    notes: text("notes").notNull().default(""),
    /** company, deal, order, invoice */
    relatedType: text("related_type"),
    relatedId: integer("related_id"),
    uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_folder_idx").on(t.folder, t.createdAt), index("files_related_idx").on(t.relatedType, t.relatedId)],
);

// ---------- Projects ----------

/** Kinds of project work (CCTV, networking...). Admin-editable; the key is what projects store. */
export const projectTypes = pgTable("project_types", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  /** BOQ sections a new project of this type starts with (editable per project). */
  defaultSections: text("default_sections").array().notNull().default(sql`'{}'::text[]`),
  isActive: boolean("is_active").notNull().default(true),
  position: integer("position").notNull().default(0),
});

/**
 * The execution side of a deal of kind "project" (one project per deal). While the deal is open the project is a lead
 * and shows the deal's stage; once the deal is won, `status` tracks the work. Customer, contact, value and team come
 * from the deal, so they are never copied here.
 */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    /** ZPJ-2026-0001 */
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    dealId: integer("deal_id")
      .notNull()
      .unique()
      .references(() => deals.id, { onDelete: "cascade" }),
    typeKey: text("type_key")
      .notNull()
      .references(() => projectTypes.key),
    /** not_started, in_progress, on_hold, completed, closed, cancelled (see lib/projects.ts) */
    status: text("status").notNull().default("not_started"),
    /** Who runs the site work; defaults to the deal owner. */
    managerId: integer("manager_id").references(() => users.id, { onDelete: "set null" }),
    siteAddress: text("site_address").notNull().default(""),
    siteMapUrl: text("site_map_url").notNull().default(""),
    /** The BOQ section headings in order; lines point at them by name (deal_items.section). */
    boqSections: text("boq_sections").array().notNull().default(sql`'{}'::text[]`),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    completedOn: date("completed_on"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_year_seq_idx").on(t.year, t.seq), index("projects_status_idx").on(t.status), index("projects_type_idx").on(t.typeKey)],
);

/** The starting checklist of each project type: copied into a new project as tasks (admin-editable). */
export const projectTaskTemplates = pgTable(
  "project_task_templates",
  {
    id: serial("id").primaryKey(),
    typeKey: text("type_key")
      .notNull()
      .references(() => projectTypes.key, { onDelete: "cascade" }),
    /** survey, work, handover (lib/projects.ts CHECKLIST_GROUPS) */
    checklistGroup: text("checklist_group").notNull(),
    title: text("title").notNull(),
    /** Days after the project was opened (survey) or after its start date (work, handover); null = no due date. */
    offsetDays: integer("offset_days"),
    required: boolean("required").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("project_task_templates_type_idx").on(t.typeKey, t.checklistGroup, t.position)],
);

/**
 * The proposal of a project (one per project): a list of blocks (lib/proposal.ts). `version` goes up on every save, so a
 * save based on an older version is refused instead of overwriting someone else's changes.
 */
export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A proposal saved as a starting point for others, for one project type or for all (type_key null). */
export const proposalTemplates = pgTable("proposal_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  typeKey: text("type_key").references(() => projectTypes.key, { onDelete: "set null" }),
  blocks: jsonb("blocks").$type<unknown[]>().notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Standard texts people saved from a terms block (warranty, exclusions...), offered in every proposal. */
export const termsLibrary = pgTable("terms_library", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  doc: jsonb("doc").$type<unknown>().notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The proposal exactly as it was when a quote was made or updated from it: its blocks, the BOQ lines and the cover
 * details. The quote's print page, PDF and email use this copy, so a sent proposal never changes afterwards.
 */
export const proposalSnapshots = pgTable("proposal_snapshots", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id")
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  quoteId: integer("quote_id")
    .notNull()
    .unique()
    .references(() => quotes.id, { onDelete: "cascade" }),
  blocks: jsonb("blocks").$type<unknown[]>().notNull(),
  /** { lines, sections, vatPct } as the price block draws them. */
  boq: jsonb("boq").$type<unknown>().notNull(),
  /** Customer, contact, site, project and quote numbers, date (components/proposal/proposal-document.tsx CoverInfo). */
  cover: jsonb("cover").$type<unknown>().notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Chat ----------

/**
 * A conversation in the team chat: a direct message between two people (`dm`), a named group channel (`group`), the
 * thread of a deal or project (`record`), or one person's Activity feed where mention cards land (`system`).
 */
export const chatChannels = pgTable(
  "chat_channels",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: ["dm", "group", "record", "system"] }).notNull(),
    name: text("name").notNull().default(""),
    topic: text("topic").notNull().default(""),
    isPrivate: boolean("is_private").notNull().default(false),
    /** "smallerId:largerId" for a DM, so two people only ever have one. */
    dmKey: text("dm_key").unique(),
    /** deal or project, for a record thread. */
    recordType: text("record_type"),
    recordId: integer("record_id"),
    /** Whose Activity feed this is (kind = system). */
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "cascade" }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("chat_channels_record_idx").on(t.recordType, t.recordId), uniqueIndex("chat_channels_owner_idx").on(t.ownerId)],
);

/** Who is in a conversation, and how far they have read. */
export const chatMembers = pgTable(
  "chat_members",
  {
    channelId: integer("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    /** The last message id they have seen; everything after it counts as unread. */
    lastReadId: integer("last_read_id").notNull().default(0),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    pinned: boolean("pinned").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] }), index("chat_members_user_idx").on(t.userId)],
);

/**
 * One chat message. Mentions are kept in the text as `@[Name](user:12)` and in `mentions` for lookups; a `card` attaches a
 * record (deal, quote, task...). `source` says where it came from when it was not typed in the chat (a timeline note, a task).
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    /** Null for lines the portal writes itself. */
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["text", "card", "system"] }).notNull().default("text"),
    body: text("body").notNull().default(""),
    mentions: integer("mentions").array().notNull().default(sql`'{}'::integer[]`),
    card: jsonb("card").$type<ChatCard>(),
    /** The message this one quotes. */
    replyToId: integer("reply_to_id"),
    /** The message this one is a thread reply to. */
    threadId: integer("thread_id"),
    replyCount: integer("reply_count").notNull().default(0),
    /** chat, activity, task */
    source: text("source").notNull().default("chat"),
    sourceId: integer("source_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_channel_idx").on(t.channelId, t.id),
    index("chat_messages_thread_idx").on(t.threadId),
    index("chat_messages_mentions_idx").using("gin", t.mentions),
    // message search (pg_trgm is switched on by scripts/migrate.ts)
    index("chat_messages_body_trgm_idx").using("gin", t.body.op("gin_trgm_ops")),
  ],
);

/** Emoji reactions on a message, one row per person per emoji. */
export const chatReactions = pgTable(
  "chat_reactions",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/** Each person's chat settings: status (do not disturb), sounds and desktop alerts, last seen. */
export const chatPrefs = pgTable("chat_prefs", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** auto = online while the portal is open, away, dnd */
  status: text("status", { enum: ["auto", "away", "dnd"] }).notNull().default("auto"),
  dndUntil: timestamp("dnd_until", { withTimezone: true }),
  statusText: text("status_text").notNull().default(""),
  sound: boolean("sound").notNull().default(true),
  desktop: boolean("desktop").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

// ---------- Notifications ----------

/**
 * One line in someone's bell. `assign` = a record was given to them; `system` = a rule found work that is due or late
 * (lib/notifications/rules.ts); `digest` = the admin's daily team summary. `dedupe_key` makes each step of a rule fire
 * once per person ("deal_no_quote:12:overdue"). A system alert is resolved when its condition no longer holds.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["assign", "system", "digest"] }).notNull(),
    /** The rule or event key, e.g. deal_no_quote, task_overdue, deal_assigned. */
    rule: text("rule").notNull(),
    priority: text("priority", { enum: ["critical", "high", "normal", "info"] }).notNull().default("normal"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** Where clicking it goes (a portal path). */
    link: text("link").notNull().default(""),
    recordType: text("record_type"),
    recordId: integer("record_id"),
    /** Who did it (assignments); null for the system. */
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull(),
    /** The deadline the alert is about, for "in 3 h" / "2 days late". */
    dueAt: timestamp("due_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_user_key_idx").on(t.userId, t.dedupeKey),
    index("notifications_user_idx").on(t.userId, t.resolvedAt, t.readAt),
    index("notifications_rule_idx").on(t.rule, t.resolvedAt),
  ],
);

// ---------- Website chat ----------

/**
 * One visitor's chat from the website widget (www.zeronix.ae). It starts `waiting` as soon as the visitor lands (the
 * sales team's portals ring), becomes `active` when an agent accepts it, and `closed` when either side ends it. The
 * visitor is known only by `token`, a random secret kept in their browser.
 */
export const webChats = pgTable(
  "web_chats",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    status: text("status", { enum: ["waiting", "active", "closed"] }).notNull().default("waiting"),
    /** The lead form, filled in before the visitor can write. */
    name: text("name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    company: text("company").notNull().default(""),
    leadAt: timestamp("lead_at", { withTimezone: true }),
    /** Where they are on the site right now, and where they came from. */
    pageUrl: text("page_url").notNull().default(""),
    pageTitle: text("page_title").notNull().default(""),
    referrer: text("referrer").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    ip: text("ip").notNull().default(""),
    /** Who accepted it. */
    agentId: integer("agent_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** visitor, agent or idle (the visitor left without a lead). */
    closedBy: text("closed_by"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /** Bumped while the visitor's page is open; online = seen in the last minute. */
    visitorSeenAt: timestamp("visitor_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** How far the agent has read (visitor messages after it are unread). */
    agentLastReadId: integer("agent_last_read_id").notNull().default(0),
    /** Pages of the site the visitor opened during this chat, oldest first, with time spent and how far they scrolled. */
    pages: jsonb("pages").$type<WebPageVisit[]>().notNull().default([]),
    /** A random id kept in the visitor's browser: links their chats over time (returning visitors). */
    visitorKey: text("visitor_key"),
    /** What their browser tells us: device, screen, language, time zone, connection, campaign (UTM), visit count. */
    client: jsonb("client").$type<WebClientInfo>(),
    /** Where they are: from their IP address (city, network), plus the exact place if they allowed location. */
    geo: jsonb("geo").$type<WebGeo>(),
    /** The visitor's rating after the chat (1-5 stars), the feedback chips they picked and their own words. */
    rating: integer("rating"),
    feedbackTags: text("feedback_tags").array().notNull().default(sql`'{}'::text[]`),
    feedback: text("feedback").notNull().default(""),
    /** The whole chat and the visitor's details as JSON, written when it ends (and again with the rating). */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    /** The CRM lead made from this chat ("Save to leads"). */
    dealId: integer("deal_id").references(() => deals.id, { onDelete: "set null" }),
    /** Which website the chat came from (zeronix.ae, zeronixtech.com), taken from the page's origin. */
    site: text("site").notNull().default(""),
    /** What the visitor was looking at when they pressed "Get B2B pricing" (industry, product, guide). */
    context: jsonb("context").$type<Record<string, string>>(),
    /** The chat box as the visitor left it (typed, never sent); agents see it live while they type. */
    draft: text("draft").notNull().default(""),
    draftAt: timestamp("draft_at", { withTimezone: true }),
    /** Phone, WhatsApp and email link clicks, downloads and copies on the site (last 100). */
    events: jsonb("events").$type<WebSiteEvent[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_chats_status_idx").on(t.status, t.lastMessageAt), index("web_chats_agent_idx").on(t.agentId), index("web_chats_visitor_idx").on(t.visitorKey)],
);

/** A line in a website chat: from the visitor, from the agent, or written by the portal ("Ismail joined"). */
export const webChatMessages = pgTable(
  "web_chat_messages",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => webChats.id, { onDelete: "cascade" }),
    sender: text("sender", { enum: ["visitor", "agent", "system"] }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_chat_messages_chat_idx").on(t.chatId, t.id)],
);


/**
 * Server errors (Admin › Errors), written by instrumentation.ts onRequestError: which page or action failed, for whom and
 * why, so first-week problems are seen instead of guessed. Kept 60 days.
 */
export const errorLog = pgTable(
  "error_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    path: text("path").notNull().default(""),
    method: text("method").notNull().default(""),
    /** render, route, action, proxy */
    routeType: text("route_type").notNull().default(""),
    routePath: text("route_path").notNull().default(""),
    message: text("message").notNull().default(""),
    digest: text("digest").notNull().default(""),
    stack: text("stack").notNull().default(""),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("error_log_at_idx").on(t.at)],
);

// ---------- Prospecting (its own tables; nothing here touches the CRM until "Convert to lead") ----------

/** Who we target: a group of companies with the offer that fits them and the people to find (seeded by migration 0039). */
export const prospectSegments = pgTable("prospect_segments", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  /** What we sell them, in one line. */
  offer: text("offer").notNull().default(""),
  /** Job titles to look for, best first. */
  keyRoles: text("key_roles").array().notNull().default(sql`'{}'::text[]`),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/** Where prospects come from: a public site, an official API, a file import or manual research. */
export const prospectSources = pgTable("prospect_sources", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  url: text("url").notNull().default(""),
  /** scrape = the Python scraper may read it; api = official API only; manual = people only; import = files. */
  access: text("access", { enum: ["scrape", "api", "manual", "import"] }).notNull().default("manual"),
  /** Which segment it mostly feeds. */
  segmentKey: text("segment_key").references(() => prospectSegments.key, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  /** When someone read the site's terms and robots rules; no scraping before this is set. */
  termsCheckedAt: date("terms_checked_at"),
  enabled: boolean("enabled").notNull().default(true),
  /** Scraper settings for listing pages (P.2). */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A company we may approach. Lives only here; Convert to lead copies it into the CRM and keeps the link. */
export const prospectCompanies = pgTable(
  "prospect_companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** Same normalising as companies.name_norm, to spot duplicates. */
    nameNorm: text("name_norm").notNull(),
    /** Bare domain ("example.ae"): the main duplicate key and the do-not-contact key. */
    domain: text("domain"),
    website: text("website").notNull().default(""),
    emirate: text("emirate").notNull().default(""),
    freeZone: text("free_zone").notNull().default(""),
    licenseNo: text("license_no").notNull().default(""),
    licenseDate: date("license_date"),
    /** Licensed activity or what they do, as published. */
    activity: text("activity").notNull().default(""),
    industry: text("industry").notNull().default(""),
    segmentKey: text("segment_key").references(() => prospectSegments.key, { onDelete: "set null" }),
    /** See lib/prospecting/constants.ts SIZE_BANDS. */
    sizeBand: text("size_band").notNull().default(""),
    phone: text("phone").notNull().default(""),
    /** The company's general address (info@...). People's emails live on prospect_people. */
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
    linkedinUrl: text("linkedin_url").notNull().default(""),
    sourceId: integer("source_id").references(() => prospectSources.id, { onDelete: "set null" }),
    /** The page this company was found on. */
    sourceUrl: text("source_url").notNull().default(""),
    /** Status key from lib/prospecting/constants.ts STATUSES. */
    status: text("status").notNull().default("sourced"),
    disqualifyReason: text("disqualify_reason").notNull().default(""),
    /** 0-10 each; score is the weighted total (fit 40%, signal 40%, reach 20%). */
    scoreFit: integer("score_fit").notNull().default(0),
    scoreSignal: integer("score_signal").notNull().default(0),
    scoreReach: integer("score_reach").notNull().default(0),
    score: real("score").notNull().default(0),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** The hook for the first email: one sentence that shows we looked at them. */
    personalLine: text("personal_line").notNull().default(""),
    notes: text("notes").notNull().default(""),
    snoozeUntil: date("snooze_until"),
    /** Filled by Convert to lead. */
    crmCompanyId: integer("crm_company_id").references(() => companies.id, { onDelete: "set null" }),
    crmDealId: integer("crm_deal_id").references(() => deals.id, { onDelete: "set null" }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prospect_companies_domain_uq").on(t.domain),
    index("prospect_companies_name_norm_idx").on(t.nameNorm),
    index("prospect_companies_status_idx").on(t.status),
    index("prospect_companies_segment_idx").on(t.segmentKey),
  ],
);

/** A person at a prospect company, ideally the decision maker. */
export const prospectPeople = pgTable(
  "prospect_people",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => prospectCompanies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    /** decision / influencer / gatekeeper */
    roleKind: text("role_kind").notNull().default("decision"),
    email: text("email").notNull().default(""),
    /** verified / likely / guess / generic; a guess is never sent until someone confirms it. */
    emailStatus: text("email_status").notNull().default("guess"),
    /** Where the email was seen (page URL), for the audit trail. */
    emailSource: text("email_source").notNull().default(""),
    phone: text("phone").notNull().default(""),
    linkedinUrl: text("linkedin_url").notNull().default(""),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prospect_people_company_idx").on(t.companyId), index("prospect_people_email_idx").on(t.email)],
);

/** Evidence that something is happening now (new licence, hiring, new office...), always with a date and a source. */
export const prospectSignals = pgTable(
  "prospect_signals",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => prospectCompanies.id, { onDelete: "cascade" }),
    /** Key from lib/prospecting/constants.ts SIGNALS. */
    kind: text("kind").notNull(),
    detail: text("detail").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    observedOn: date("observed_on").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prospect_signals_company_idx").on(t.companyId)],
);

/** The timeline of a prospect: notes, status changes, imports, research. */
export const prospectActivities = pgTable(
  "prospect_activities",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => prospectCompanies.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** note / status / created / import / research / converted */
    kind: text("kind").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prospect_activities_company_idx").on(t.companyId, t.createdAt)],
);

/** Never email these: an address or a whole domain. Checked when a prospect is queued and again just before sending. */
export const outreachSuppression = pgTable("outreach_suppression", {
  id: serial("id").primaryKey(),
  /** Lower-case email ("a@b.ae") or bare domain ("b.ae"). */
  value: text("value").notNull().unique(),
  kind: text("kind", { enum: ["email", "domain"] }).notNull(),
  /** unsubscribe / bounce / complaint / customer / manual */
  reason: text("reason").notNull().default("manual"),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A mailbox that sends cold email (on the separate sending domain, never zeronix.ae). Its daily limit starts low and
 * rises each week while the domain warms up; nothing is sent from it until a connection test has passed.
 */
export const outreachMailboxes = pgTable("outreach_mailboxes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  fromName: text("from_name").notNull().default(""),
  /** Login name; usually the email address. */
  username: text("username").notNull().default(""),
  passwordEnc: text("password_enc").notNull(),
  smtpHost: text("smtp_host").notNull().default("smtp.hostinger.com"),
  smtpPort: integer("smtp_port").notNull().default(465),
  imapHost: text("imap_host").notNull().default("imap.hostinger.com"),
  imapPort: integer("imap_port").notNull().default(993),
  /** Emails a day at the start of warm-up, the target once warm, and how much the limit grows each week. */
  startCap: integer("start_cap").notNull().default(15),
  dailyCap: integer("daily_cap").notNull().default(40),
  rampPerWeek: integer("ramp_per_week").notNull().default(5),
  warmupStartedOn: date("warmup_started_on"),
  /** mon..sun, in Asia/Dubai time. */
  sendDays: text("send_days").array().notNull().default(sql`'{mon,tue,wed,thu,fri}'::text[]`),
  windowStart: text("window_start").notNull().default("09:00"),
  windowEnd: text("window_end").notNull().default("17:00"),
  /** Plain-text signature under every email from this mailbox. */
  signature: text("signature").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  /** Highest INBOX UID already checked for replies and bounces. */
  lastSeenUid: integer("last_seen_uid").notNull().default(0),
  repliesCheckedAt: timestamp("replies_checked_at", { withTimezone: true }),
  /** When this mailbox last sent, so emails go out spread over the day. */
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok").notNull().default(false),
  lastError: text("last_error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** An AI service Prospecting may use once AI features are switched on (research notes, first drafts, reply sorting). */
export const prospectAiProviders = pgTable("prospect_ai_providers", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  /** anthropic / openai / gemini / openai_compatible / ollama (see lib/prospecting/ai.ts). */
  provider: text("provider").notNull(),
  model: text("model").notNull().default(""),
  /** Empty = the provider's usual address. */
  baseUrl: text("base_url").notNull().default(""),
  apiKeyEnc: text("api_key_enc").notNull().default(""),
  /** Last 4 characters of the key, so people can tell keys apart without seeing them. */
  keyHint: text("key_hint").notNull().default(""),
  /** research / writing / replies */
  uses: text("uses").array().notNull().default(sql`'{}'::text[]`),
  isDefault: boolean("is_default").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  /** Most calls a day for research (keeps AI use and cost low). */
  dailyLimit: integer("daily_limit").notNull().default(20),
  /** OpenRouter: use the free-model list (prospect_ai_models) and switch between them, instead of one fixed model. */
  autoFree: boolean("auto_free").notNull().default(false),
  /** OpenRouter: may add its paid web search (needs credits) when research has to search. */
  paidSearch: boolean("paid_search").notNull().default(false),
  /** The account's daily allowance is used up until then (OpenRouter free requests reset at 00:00 UTC). */
  outUntil: timestamp("out_until", { withTimezone: true }),
  /** Last known allowance from the provider ({ used, limit, remaining, checkedAt }). */
  usage: jsonb("usage").$type<{ used: number; limit: number; remaining: number; checkedAt: string }>(),
  modelsRefreshedAt: timestamp("models_refreshed_at", { withTimezone: true }),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok").notNull().default(false),
  lastError: text("last_error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One "Research" run for a prospect. The app queues it; the Python scraper (scraper/) reads the company website and
 * writes `result`; the app then applies it to the prospect and, only if the website gave no contact at all (or there is
 * no website), asks an AI provider once.
 */
export const prospectResearchRuns = pgTable(
  "prospect_research_runs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => prospectCompanies.id, { onDelete: "cascade" }),
    /** The bare domain read; empty when there was none (then only AI can look). */
    domain: text("domain").notNull().default(""),
    /** queued -> crawling -> crawled (or failed) -> applying -> done; cancelled when stopped while waiting */
    status: text("status").notNull().default("queued"),
    /** site = read the website only (free); ai = also let AI read the pages and search the web for the key people. */
    mode: text("mode").notNull().default("site"),
    /** What is happening right now, for the progress panel ("AI searching the web for people"). */
    stage: text("stage").notNull().default(""),
    /** What the scraper found (see scraper/zx_scraper/crawl.py). */
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error").notNull().default(""),
    pagesRead: integer("pages_read").notNull().default(0),
    /** "" not needed / used / no_provider / limit / recent / failed */
    aiStatus: text("ai_status").notNull().default(""),
    aiProviderId: integer("ai_provider_id").references(() => prospectAiProviders.id, { onDelete: "set null" }),
    aiTokens: integer("ai_tokens").notNull().default(0),
    aiResult: jsonb("ai_result").$type<Record<string, unknown>>(),
    /** Short summary shown on the prospect ("3 emails, 2 phones, 1 person"). */
    summary: text("summary").notNull().default(""),
    requestedBy: integer("requested_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("prospect_research_runs_status_idx").on(t.status, t.id), index("prospect_research_runs_company_idx").on(t.companyId, t.id)],
);

/**
 * The free models an OpenRouter provider can switch between, best first. Refreshed from OpenRouter's catalogue every
 * day; a model that keeps failing rests until cooldown_until, and people can switch one off.
 */
export const prospectAiModels = pgTable(
  "prospect_ai_models",
  {
    id: serial("id").primaryKey(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => prospectAiProviders.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    name: text("name").notNull().default(""),
    contextLength: integer("context_length").notNull().default(0),
    /** Accepts response_format (JSON mode). */
    json: boolean("json").notNull().default(false),
    expiresOn: date("expires_on"),
    position: integer("position").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    okCount: integer("ok_count").notNull().default(0),
    failCount: integer("fail_count").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("prospect_ai_models_uq").on(t.providerId, t.modelId)],
);

/** A series of emails: step 1 starts a thread, the follow-ups reply in it after a number of working days. */
export const outreachSequences = pgTable("outreach_sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Optional: the segment this sequence is written for. */
  segmentKey: text("segment_key").references(() => prospectSegments.key, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outreachSequenceSteps = pgTable(
  "outreach_sequence_steps",
  {
    id: serial("id").primaryKey(),
    sequenceId: integer("sequence_id")
      .notNull()
      .references(() => outreachSequences.id, { onDelete: "cascade" }),
    /** 1 = the first email. */
    position: integer("position").notNull(),
    /** Working days (Mon-Fri) after the previous step; 0 for step 1. */
    delayDays: integer("delay_days").notNull().default(0),
    /** Only step 1 has its own subject; follow-ups reply in the same thread ("Re: ..."). */
    subject: text("subject").notNull().default(""),
    /** Text with merge fields such as {first_name}; see lib/prospecting/outreach-rules.ts. */
    body: text("body").notNull(),
  },
  (t) => [uniqueIndex("outreach_sequence_steps_uq").on(t.sequenceId, t.position)],
);

/** Every cold email sent (or that failed to send), for the campaign page and the daily limits. */
export const outreachMessages = pgTable(
  "outreach_messages",
  {
    id: serial("id").primaryKey(),
    enrollmentId: integer("enrollment_id")
      .notNull()
      .references(() => outreachEnrollments.id, { onDelete: "cascade" }),
    mailboxId: integer("mailbox_id").references(() => outreachMailboxes.id, { onDelete: "set null" }),
    step: integer("step").notNull(),
    toEmail: text("to_email").notNull(),
    ccEmails: text("cc_emails").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject").notNull().default(""),
    messageId: text("message_id").notNull().default(""),
    /** Empty when it went out. */
    error: text("error").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_messages_mailbox_idx").on(t.mailboxId, t.sentAt), index("outreach_messages_enrollment_idx").on(t.enrollmentId)],
);

/** Who gets which sequence from which mailboxes. */
export const outreachCampaigns = pgTable("outreach_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sequenceId: integer("sequence_id")
    .notNull()
    .references(() => outreachSequences.id, { onDelete: "restrict" }),
  /** Sending mailboxes used in turn; empty = every mailbox that is switched on. */
  mailboxIds: integer("mailbox_ids").array().notNull().default(sql`'{}'::int[]`),
  /** draft / active / paused / finished */
  status: text("status").notNull().default("active"),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
  /** What we offer and how to write (from the campaign chat). Set = AI writes each first email from it. */
  brief: text("brief").notNull().default(""),
  /** The industry the campaign was built for (shown only). */
  industry: text("industry").notNull().default(""),
  /** True = first emails wait in Review; false = they are scheduled as soon as AI has written them. */
  review: boolean("review").notNull().default(true),
  /** No email goes out before this. */
  startAt: timestamp("start_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One person in one campaign. Starts as a draft (the first email waits in the review queue); approving it makes it
 * active and the sending queue (P.6) takes over. At most one open enrollment per person.
 */
export const outreachEnrollments = pgTable(
  "outreach_enrollments",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => outreachCampaigns.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => prospectCompanies.id, { onDelete: "cascade" }),
    /** The key person written to; empty when only a company inbox (info@) is known. */
    personId: integer("person_id").references(() => prospectPeople.id, { onDelete: "cascade" }),
    /** writing (AI drafting) / draft / active / paused / replied / bounced / unsubscribed / completed / stopped / skipped */
    status: text("status").notNull().default("draft"),
    /** The main address (To) and every other address found for the company (Cc), fixed when added. */
    toEmail: text("to_email").notNull().default(""),
    ccEmails: text("cc_emails").array().notNull().default(sql`'{}'::text[]`),
    /** AI writing: the provider that wrote it, and why it could not yet. */
    aiProviderId: integer("ai_provider_id").references(() => prospectAiProviders.id, { onDelete: "set null" }),
    writeError: text("write_error").notNull().default(""),
    /** The first email as it will go out (rendered from step 1, editable in the review queue). */
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    /** The step sent last (0 = none yet) and when the next one is due. */
    currentStep: integer("current_step").notNull().default(0),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    /** Mailbox the thread goes out from (chosen when the first email is sent). */
    mailboxId: integer("mailbox_id").references(() => outreachMailboxes.id, { onDelete: "set null" }),
    /** Message-ID of the first email, so follow-ups stay in its thread. */
    threadMessageId: text("thread_message_id").notNull().default(""),
    stopReason: text("stop_reason").notNull().default(""),
    approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outreach_enrollments_campaign_idx").on(t.campaignId, t.status),
    index("outreach_enrollments_company_idx").on(t.companyId),
    index("outreach_enrollments_due_idx").on(t.status, t.nextSendAt),
    uniqueIndex("outreach_enrollments_open_uq").on(t.companyId).where(sql`status in ('writing','draft','active','paused')`),
  ],
);


/** Who changed what in the money side (and later everywhere): one row per action, with the record before and after. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** e.g. "invoice.issue", "payment.void", "bill.create". */
    action: text("action").notNull(),
    /** Table-ish name of the record ("invoice", "payment", "bill"...) and its id. */
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    /** One line for people: "INV-00123 issued to Acme, AED 5,250.00". */
    summary: text("summary").notNull().default(""),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId), index("audit_log_org_at_idx").on(t.organizationId, t.at), orgPolicy()],
);

/**
 * Number series per organisation (and per fiscal year when the series restarts each year). New series (journals...)
 * use this through takeSeriesNumber() in lib/doc-numbers.ts; the older ones move here when multi-tenancy is switched on.
 */
export const docSeries = pgTable(
  "doc_series",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    key: text("key").notNull(),
    /** 0 = one running series that never restarts. */
    fiscalYear: integer("fiscal_year").notNull().default(0),
    prefix: text("prefix").notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    digits: integer("digits").notNull().default(4),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("doc_series_key_uq").on(t.organizationId, t.key, t.fiscalYear), orgPolicy()],
);

// ---------- Ledger (accounts plan A1): chart of accounts, journals, tax codes, bank accounts ----------

/**
 * Chart of accounts. Group accounts only add up their children; postings go to leaf accounts. Accounts with a
 * system_key (AR, AP, VAT, inventory, the expense categories...) are the ones the portal posts to by itself: they can be
 * renamed and renumbered but not retyped or switched off. Seeded from a template by ensureLedger() (lib/ledger/setup.ts).
 */
export const ledgerAccounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["asset", "liability", "equity", "income", "expense"] }).notNull(),
    /** Finer kind used by reports and pickers: bank, cash, receivable, payable, inventory, tax, cogs, fixed_asset, other. */
    subtype: text("subtype").notNull().default("other"),
    parentId: integer("parent_id").references((): AnyPgColumn => ledgerAccounts.id),
    isGroup: boolean("is_group").notNull().default(false),
    systemKey: text("system_key"),
    currency: text("currency").notNull().default("AED"),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_code_uq").on(t.organizationId, t.code),
    uniqueIndex("accounts_system_key_uq").on(t.organizationId, t.systemKey).where(sql`system_key IS NOT NULL`),
    index("accounts_parent_idx").on(t.parentId),
    orgPolicy(),
  ],
);

/** Tax codes of the organisation's regime (UAE: SR, ZR, EX, RC, IM, OS), copied from lib/tax so accounts can be set per code. */
export const taxCodes = pgTable(
  "tax_codes",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    ratePct: numeric("rate_pct", { precision: 6, scale: 3, mode: "number" }).notNull(),
    selfAssessed: boolean("self_assessed").notNull().default(false),
    /** Return boxes it feeds on sales and on purchases (VAT 201 box numbers). */
    saleBoxes: text("sale_boxes").array().notNull().default(sql`'{}'::text[]`),
    purchaseBoxes: text("purchase_boxes").array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("tax_codes_code_uq").on(t.organizationId, t.code), orgPolicy()],
);

/** The parts of a tax code (UAE VAT: one; GST: CGST + SGST or IGST) and the accounts each part posts to. */
export const taxCodeComponents = pgTable(
  "tax_code_components",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    taxCodeId: integer("tax_code_id")
      .notNull()
      .references(() => taxCodes.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    share: numeric("share", { precision: 6, scale: 4, mode: "number" }).notNull().default(1),
    /** Tax charged on sales (output) and tax paid on purchases (input). Self-assessed codes use both. */
    salesAccountId: integer("sales_account_id").references(() => ledgerAccounts.id),
    purchaseAccountId: integer("purchase_account_id").references(() => ledgerAccounts.id),
  },
  (t) => [uniqueIndex("tax_code_components_uq").on(t.taxCodeId, t.key), orgPolicy()],
);

/** Where money is kept: each bank account, cash box or card is one ledger account plus these details. */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    accountId: integer("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["bank", "cash", "card", "petty"] }).notNull(),
    bankName: text("bank_name").notNull().default(""),
    accountNumber: text("account_number").notNull().default(""),
    iban: text("iban").notNull().default(""),
    swift: text("swift").notNull().default(""),
    /** The account holder as the bank knows it, printed on invoices; empty = our company name. */
    holderName: text("holder_name").notNull().default(""),
    currency: text("currency").notNull().default("AED"),
    /** The one picked by default for its kind (cash or bank payments). */
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bank_accounts_account_uq").on(t.accountId), orgPolicy()],
);

/**
 * A download being made in the background (lib/export-jobs.ts): the address that makes the file, where it stands, and the
 * finished file on disk until it is removed after a day. Lower priority number goes first.
 */
export const exportJobs = pgTable(
  "export_jobs",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label").notNull(),
    /** queued, running, done, failed */
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
    priority: integer("priority").notNull().default(5),
    fileName: text("file_name"),
    contentType: text("content_type"),
    storedName: text("stored_name"),
    sizeBytes: integer("size_bytes"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** When a browser tab picked it up. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [index("export_jobs_queue_idx").on(t.status, t.priority, t.id), index("export_jobs_user_idx").on(t.userId, t.status), orgPolicy()],
);

/** One person's arrangement of a dashboard: which ready-made widgets, in what order, how wide (lib/dashboard-widgets.ts). */
export const dashboardLayouts = pgTable(
  "dashboard_layouts",
  {
    organizationId: orgId(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dashboard: text("dashboard").notNull(),
    layout: jsonb("layout").$type<{ id: string; w: number }[]>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.dashboard] }), orgPolicy()],
);

/** One row per organisation: the settings of its books. */
export const accountingSettings = pgTable(
  "accounting_settings",
  {
    organizationId: orgId().primaryKey(),
    /** Nothing can be posted on or before this day (closed periods, filed VAT returns). */
    lockDate: date("lock_date"),
    /** The day the ledger starts (opening balances from Zoho are dated the day before). */
    cutoverDate: date("cutover_date"),
    /** VAT return length in months (UAE: 3, or 1 above AED 150M) and the month the first quarter of the year starts in. */
    vatPeriodMonths: integer("vat_period_months").notNull().default(3),
    vatPeriodStartMonth: integer("vat_period_start_month").notNull().default(1),
    /** Chart-of-accounts template and version it was seeded from (lets later versions add missing accounts). */
    coaTemplate: text("coa_template").notNull().default("ae-trading"),
    coaVersion: integer("coa_version").notNull().default(0),
    /** Opening balances: Zoho account name → our account id, remembered for the next import. */
    openingMap: jsonb("opening_map").$type<Record<string, number>>().notNull().default({}),
    /** Settings › Posting accounts: a system key → the account that posts instead of its usual one. */
    accountMap: jsonb("account_map").$type<Record<string, number>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  () => [orgPolicy()],
);

/**
 * A journal entry: posted and never changed. A mistake is undone by a reversal (reversal_of_id), never by an UPDATE or
 * DELETE: triggers in migration 0050 refuse both, refuse an entry whose lines do not balance, and refuse a date on or
 * before the lock date. source_type/source_id/purpose say which document posted it (unique, so posting is idempotent).
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    number: text("number").notNull(),
    date: date("date").notNull(),
    /** manual, opening, invoice, credit_note, receipt, bill, expense, supplier_payment, bank_transfer, vat_settlement ... */
    sourceType: text("source_type").notNull(),
    sourceId: integer("source_id"),
    /** What the document posted ("post", "cogs"...); a reversal adds ":rev". */
    purpose: text("purpose").notNull().default("post"),
    memo: text("memo").notNull().default(""),
    reversalOfId: integer("reversal_of_id").references((): AnyPgColumn => journalEntries.id),
    /** Sum of the debits (= sum of the credits), for lists. */
    total: numeric("total", { precision: 18, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("AED"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("journal_entries_number_uq").on(t.organizationId, t.number),
    uniqueIndex("journal_entries_source_uq").on(t.organizationId, t.sourceType, t.sourceId, t.purpose).where(sql`source_id IS NOT NULL`),
    uniqueIndex("journal_entries_reversal_uq").on(t.reversalOfId),
    index("journal_entries_date_idx").on(t.organizationId, t.date),
    orgPolicy(),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: serial("id").primaryKey(),
    organizationId: orgId(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => journalEntries.id),
    lineNo: integer("line_no").notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    debit: numeric("debit", { precision: 18, scale: 2, mode: "number" }).notNull().default(0),
    credit: numeric("credit", { precision: 18, scale: 2, mode: "number" }).notNull().default(0),
    /** Foreign currency of the line (base currency when the same) and its amounts in that currency. */
    currency: text("currency").notNull().default("AED"),
    fxRate: numeric("fx_rate", { precision: 18, scale: 6, mode: "number" }).notNull().default(1),
    debitFc: numeric("debit_fc", { precision: 18, scale: 2, mode: "number" }).notNull().default(0),
    creditFc: numeric("credit_fc", { precision: 18, scale: 2, mode: "number" }).notNull().default(0),
    description: text("description").notNull().default(""),
    /** Customer (companies.id) or supplier (suppliers.id) the line is about: AR/AP per party. */
    partyType: text("party_type", { enum: ["customer", "supplier"] }),
    partyId: integer("party_id"),
    /** Tax code and the taxable amount, so the VAT return can be built from the ledger. */
    taxCodeId: integer("tax_code_id").references(() => taxCodes.id),
    taxBase: numeric("tax_base", { precision: 18, scale: 2, mode: "number" }),
    /** Dimensions for profit per order, deal and project. No foreign keys: lines are never updated. */
    orderId: integer("order_id"),
    dealId: integer("deal_id"),
    projectId: integer("project_id"),
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.organizationId, t.accountId),
    index("journal_lines_party_idx").on(t.partyType, t.partyId),
    check("journal_lines_one_side", sql`debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0)`),
    orgPolicy(),
  ],
);
