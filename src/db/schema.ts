import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ChatCard } from "@/lib/chat/types";
import type { OfferDraft } from "@/lib/llm/schema";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "sales"] }).notNull().default("sales"),
  isActive: boolean("is_active").notNull().default(true),
  /** Apps this user may open (keys from lib/apps.ts). NULL = the role's defaults. Admins always see everything. */
  apps: text("apps").array(),
  /** Which sales records they see: "own" = deals they are assigned to (and what hangs off them), "all" = everyone's. Admins always see all. */
  dataScope: text("data_scope", { enum: ["own", "all"] }).notNull().default("own"),
  /** Shown in the email signature. */
  jobTitle: text("job_title").notNull().default(""),
  phone: text("phone").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
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
    /** ZSO-2026-0001 */
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    quoteId: integer("quote_id")
      .notNull()
      .unique()
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
    number: text("number").notNull().unique(),
    /**
     * "sale": issued here from an order. "opening": a customer invoice still unpaid when the portal took over from Zoho,
     * kept with Zoho's number and total, no lines, no order; it counts in what customers owe but not in sales or VAT.
     */
    kind: text("kind", { enum: ["sale", "opening"] }).notNull().default("sale"),
    /** One active (not cancelled) invoice per order; a cancelled one is followed by a new one. Empty for opening invoices. */
    orderId: integer("order_id").references(() => salesOrders.id),
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
    customerRef: text("customer_ref").notNull().default(""),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** issued, cancelled */
    status: text("status").notNull().default("issued"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_company_idx").on(t.companyId), index("invoices_due_idx").on(t.status, t.dueDate), index("invoices_order_idx").on(t.orderId)],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId, t.position)],
);

/** Cancels a whole invoice (ZCN-2026-0001). Partial credit notes can come later. */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    invoiceId: integer("invoice_id")
      .notNull()
      .unique()
      .references(() => invoices.id),
    issueDate: date("issue_date").notNull(),
    reason: text("reason").notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("credit_notes_year_seq_idx").on(t.year, t.seq)],
);

/**
 * Money received against an invoice (ZRV-2026-0001 receipt). Full or part, cash or bank transfer. A wrong entry is voided
 * with a reason, never deleted, so the receipt numbers stay complete.
 */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    paidOn: date("paid_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** cash, bank */
    method: text("method").notNull(),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payments_year_seq_idx").on(t.year, t.seq), index("payments_invoice_idx").on(t.invoiceId), index("payments_company_idx").on(t.companyId)],
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
    dealId: integer("deal_id").references(() => deals.id),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
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
    index("bills_date_idx").on(t.billDate),
  ],
);

export const billItems = pgTable(
  "bill_items",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 12, scale: 2, mode: "number" }).notNull().default(1),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [index("bill_items_bill_idx").on(t.billId, t.position)],
);

/** Money paid out against a bill or expense (payment voucher ZPV-2026-0001). Voided with a reason, never deleted. */
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull().unique(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    paidOn: date("paid_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** cash, bank */
    method: text("method").notNull(),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("supplier_payments_year_seq_idx").on(t.year, t.seq), index("supplier_payments_bill_idx").on(t.billId), index("supplier_payments_supplier_idx").on(t.supplierId)],
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
    /** Pages of the site the visitor opened during this chat, oldest first (at most 30). */
    pages: jsonb("pages").$type<{ url: string; title: string; at: string }[]>().notNull().default([]),
    /** The visitor's rating after the chat (1-5 stars), the feedback chips they picked and their own words. */
    rating: integer("rating"),
    feedbackTags: text("feedback_tags").array().notNull().default(sql`'{}'::text[]`),
    feedback: text("feedback").notNull().default(""),
    /** The whole chat and the visitor's details as JSON, written when it ends (and again with the rating). */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    /** The CRM lead made from this chat ("Save to leads"). */
    dealId: integer("deal_id").references(() => deals.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_chats_status_idx").on(t.status, t.lastMessageAt), index("web_chats_agent_idx").on(t.agentId)],
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
