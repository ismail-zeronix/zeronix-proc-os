import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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
    /** Where we first found them (see lib/sales.ts SOURCES). */
    source: text("source").notNull().default(""),
    notes: text("notes").notNull().default(""),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("companies_name_norm_idx").on(t.nameNorm)],
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
