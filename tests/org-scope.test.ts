import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

/**
 * The multi-tenant base (accounts plan, A0): every table belongs to an organisation. Tables that existed before
 * 2026-11-05 get organization_id when multi-tenancy is switched on (Phase T); they are listed here and the list only
 * shrinks. A new table must have organization_id (use orgId() in schema.ts) and the org_isolation policy (orgPolicy()).
 */
const LEGACY_NO_ORG = new Set([
  "activities", "attendance_absences", "attendance_punches", "brand_profile", "chat_channels", "chat_members", "chat_messages",
  "chat_prefs", "chat_reactions", "company_owners", "contacts", "deal_assignees", "deal_items", "deals", "error_log", "files",
  "login_failures", "mail_accounts", "mail_messages", "mail_sent_log", "notifications", "offers", "outreach_campaigns",
  "outreach_enrollments", "outreach_mailboxes", "outreach_messages", "outreach_sequence_steps", "outreach_sequences",
  "outreach_suppression", "parse_corrections", "price_lists", "product_aliases", "products", "project_task_templates",
  "project_types", "projects", "proposal_snapshots", "proposal_templates", "proposals", "prospect_activities", "prospect_ai_models",
  "prospect_ai_providers", "prospect_companies", "prospect_people", "prospect_research_runs", "prospect_segments", "prospect_signals",
  "prospect_sources", "quote_items", "sales_order_items", "settings", "supplier_feeds", "tasks", "terms_library", "web_chat_messages",
  "web_chats",
]);

/** Older tables that got the column in A0; their RLS policy comes in Phase T with the rest. */
const A0_COLUMN_ONLY = new Set([
  "users", "suppliers", "companies", "quotes", "sales_orders", "invoices", "invoice_items", "credit_notes", "payments", "bills",
  "bill_items", "supplier_payments",
]);

const tables = Object.values(schema as Record<string, unknown>)
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => getTableConfig(t));

describe("every table belongs to an organisation", () => {
  it("new tables carry organization_id and the org_isolation policy", () => {
    const problems: string[] = [];
    for (const t of tables) {
      if (t.name === "organizations" || LEGACY_NO_ORG.has(t.name)) continue;
      const col = t.columns.find((c) => c.name === "organization_id");
      if (!col) problems.push(`${t.name}: no organization_id (use orgId())`);
      else if (!col.notNull) problems.push(`${t.name}: organization_id must be NOT NULL`);
      if (!A0_COLUMN_ONLY.has(t.name) && !t.policies.some((p) => p.name === "org_isolation")) problems.push(`${t.name}: no org_isolation policy (use orgPolicy())`);
    }
    expect(problems).toEqual([]);
  });

  it("the legacy list only names tables that still lack the column", () => {
    const stale = tables.filter((t) => LEGACY_NO_ORG.has(t.name) && t.columns.some((c) => c.name === "organization_id")).map((t) => t.name);
    expect(stale).toEqual([]);
  });
});
