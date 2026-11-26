import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createCompany, createContact, createDeal, addCompanyNote, logActivity, markDealWon, moveDeal, updateDeal } from "@/app/(app)/crm/actions";
import { addItem, createQuote } from "@/app/(app)/sales/quote-actions";
import { createTask } from "@/app/(app)/tasks/actions";
import { audit } from "@/lib/audit";
import { runAsClaude } from "@/lib/auth/session";
import { ACTIVITY_TYPES, OUTCOME_KEYS, SOURCES, STAGES } from "@/lib/sales";
import { ingestMessages, pushedMessageSchema } from "@/lib/procurement/intake";
import { UserError } from "@/lib/user-error";
import { link } from "./read-tools";
import { app, defineTool, type McpCtx, type McpTool } from "./tool";

/**
 * The changes Claude may make. Each one runs the portal's own server action as the connected person (runAsClaude), so the
 * same checks, timeline entries and notifications apply as when they click it themselves; then it is written to the
 * audit trail as "claude.<tool>" (Admin › Claude shows these). No tool deletes, posts money or emails anyone.
 */

const VIA = " (via Claude)";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Runs `fn` as the connected person, then records it in the audit trail. */
async function asUser<T>(c: McpCtx, entry: { action: string; entity: string; summary: string }, fn: () => Promise<T>, entityId?: (r: T) => number | null | undefined): Promise<T> {
  const user = { id: c.auth.userId, name: c.auth.name, email: c.auth.email, role: c.auth.role, sv: c.auth.sv, org: c.auth.orgId };
  const result = await runAsClaude(user, fn);
  await audit(db, { userId: c.auth.userId, action: `claude.${entry.action}`, entity: entry.entity, entityId: entityId?.(result) ?? null, summary: `via Claude: ${entry.summary}`, after: result ?? null, orgId: c.auth.orgId });
  return result;
}

const createTaskTool = defineTool({
  name: "create_task",
  title: "Create a task",
  write: true,
  needs: app("tasks"),
  description: "Create a task or follow-up for someone (default: the connected person), optionally on a deal. Ask the user before calling.",
  input: z.object({
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(2000).default(""),
    due_date: day.optional().describe("YYYY-MM-DD"),
    priority: z.enum(["normal", "high"]).default("normal"),
    assignee_id: z.number().int().optional().describe("User id from the team tool; default is the connected person"),
    deal_id: z.number().int().optional(),
  }),
  async run(a, c) {
    await asUser(c, { action: "create_task", entity: "task", summary: `task "${a.title}"${a.due_date ? ` due ${a.due_date}` : ""}` }, () =>
      createTask({ title: a.title, notes: a.notes ? `${a.notes}${VIA}` : `Added${VIA}`, dueDate: a.due_date ?? "", priority: a.priority, assignedTo: a.assignee_id, related: a.deal_id ? { type: "deal", id: a.deal_id } : undefined }),
    );
    const [t] = await db
      .select({ id: schema.tasks.id, assignee: schema.users.name })
      .from(schema.tasks)
      .innerJoin(schema.users, eq(schema.users.id, schema.tasks.assignedTo))
      .where(and(eq(schema.tasks.createdBy, c.auth.userId), eq(schema.tasks.title, a.title)))
      .orderBy(desc(schema.tasks.id))
      .limit(1);
    return { done: true, taskId: t?.id, assignedTo: t?.assignee, link: `${c.base}/tasks` };
  },
});

const addNote = defineTool({
  name: "add_note",
  title: "Add a note or log a call",
  write: true,
  needs: app("crm", "sales", "projects"),
  description:
    "Add an entry to a deal's timeline (note, call, whatsapp, email, meeting), or a note on a customer. A call needs an outcome. Contact (call, whatsapp, email, meeting) on an open deal needs follow_up_date, which becomes the deal's next follow-up, unless the deal already has a later one or the outcome is not_interested / wrong_number. Logging contact on a 'new' deal moves it to 'contacted'. Ask the user before calling.",
  input: z.object({
    deal_id: z.number().int().optional(),
    customer_id: z.number().int().optional().describe("For a customer note when there is no deal"),
    type: z.enum(ACTIVITY_TYPES.map((t) => t.key) as [string, ...string[]]).default("note"),
    text: z.string().trim().min(1).max(4000),
    outcome: z.enum(OUTCOME_KEYS).optional().describe("How a call or WhatsApp went; required for a call"),
    follow_up_date: day.optional().describe("YYYY-MM-DD; deals only"),
  }),
  async run(a, c) {
    if (a.deal_id) {
      const dealId = a.deal_id;
      await asUser(c, { action: "add_note", entity: "deal", summary: `${a.type} on deal ${dealId}` }, () => logActivity(dealId, { type: a.type, body: `${a.text}${VIA}`, outcome: a.outcome, followUp: a.follow_up_date }), () => dealId);
      return { done: true, link: link.deal(c, dealId) };
    }
    if (a.customer_id) {
      const companyId = a.customer_id;
      if (a.follow_up_date) throw new UserError("A follow-up date needs a deal. Use create_task for a customer without a deal.");
      await asUser(c, { action: "add_note", entity: "company", summary: `note on customer ${companyId}` }, () => addCompanyNote(companyId, `${a.text}${VIA}`), () => companyId);
      return { done: true, link: link.customer(c, companyId) };
    }
    throw new UserError("Give a deal_id or a customer_id.");
  },
});

const STAGE_KEYS = STAGES.map((s) => s.key) as [string, ...string[]];

const updateDealTool = defineTool({
  name: "update_deal",
  title: "Update a deal",
  write: true,
  needs: app("crm", "projects"),
  description:
    "Change a deal's stage, value (AED before VAT), expected close date or next follow-up. Lost needs lost_reason. Won needs the winning quote_id or agreed_terms (when nothing was quoted in the portal); it accepts that quote like the 'Mark as won' button. Ask the user before calling.",
  input: z.object({
    deal_id: z.number().int(),
    stage: z.enum(STAGE_KEYS).optional(),
    lost_reason: z.string().max(200).optional(),
    quote_id: z.number().int().optional().describe("Winning quote, for stage won"),
    agreed_terms: z.string().max(500).optional().describe("For stage won without a quote: amount, PO, terms"),
    value_aed: z.number().min(0).optional(),
    expected_close: day.optional(),
    follow_up_at: z.string().optional().describe("ISO date-time of the next follow-up, '' to clear"),
  }),
  async run(a, c) {
    const id = a.deal_id;
    const changes: string[] = [];
    const patch: Parameters<typeof updateDeal>[1] = {};
    if (a.value_aed !== undefined) {
      patch.valueAed = a.value_aed;
      changes.push(`value ${a.value_aed}`);
    }
    if (a.expected_close !== undefined) {
      patch.expectedClose = a.expected_close;
      changes.push(`close ${a.expected_close}`);
    }
    if (a.follow_up_at !== undefined) {
      patch.followUpAt = a.follow_up_at;
      changes.push(`follow-up ${a.follow_up_at || "cleared"}`);
    }
    if (!changes.length && !a.stage) throw new UserError("Nothing to change: give a stage or a field.");
    if (changes.length) await asUser(c, { action: "update_deal", entity: "deal", summary: `deal ${id}: ${changes.join(", ")}` }, () => updateDeal(id, patch), () => id);
    if (a.stage === "won") {
      await asUser(c, { action: "update_deal", entity: "deal", summary: `deal ${id} marked won` }, () => markDealWon(id, { quoteId: a.quote_id ?? null, terms: a.agreed_terms ? `${a.agreed_terms}${VIA}` : "" }), () => id);
    } else if (a.stage) {
      const stage = a.stage;
      await asUser(c, { action: "update_deal", entity: "deal", summary: `deal ${id} moved to ${stage}` }, () => moveDeal(id, stage, a.lost_reason ?? ""), () => id);
    }
    const [d] = await db.select({ stage: schema.deals.stage, valueAed: schema.deals.valueAed, expectedClose: schema.deals.expectedClose }).from(schema.deals).where(eq(schema.deals.id, id));
    return { done: true, deal: d, link: link.deal(c, id) };
  },
});

const createLead = defineTool({
  name: "create_lead",
  title: "Create a lead (deal)",
  write: true,
  needs: app("crm"),
  description:
    "Add a new deal at 'new' for an existing customer (customer_id) or a new one (customer_name; an existing customer with the same name is reused), with an optional contact person. Creates the 'contact them today' task for the owner. Ask the user before calling.",
  input: z.object({
    customer_id: z.number().int().optional(),
    customer_name: z.string().trim().max(160).default(""),
    contact_id: z.number().int().optional(),
    contact_name: z.string().trim().max(120).default(""),
    contact_email: z.string().trim().max(160).default(""),
    contact_phone: z.string().trim().max(40).default(""),
    title: z.string().trim().max(160).default("").describe("Leave empty to name it from the customer and requirement"),
    requirement: z.string().trim().max(4000).default("").describe("What they need: items, quantities, deadline"),
    source: z.enum(SOURCES).optional(),
    value_aed: z.number().min(0).optional(),
    owner_ids: z.array(z.number().int()).max(10).optional().describe("Salespeople on the deal, main owner first (team tool); default the connected person"),
    emirate: z.string().max(40).default(""),
  }),
  async run(a, c) {
    const r = await asUser(
      c,
      { action: "create_lead", entity: "deal", summary: `lead for ${a.customer_name || `customer ${a.customer_id}`}` },
      () =>
        createDeal({
          companyId: a.customer_id,
          companyName: a.customer_name,
          contactId: a.contact_id,
          contactName: a.contact_name,
          contactEmail: a.contact_email,
          contactPhone: a.contact_phone,
          title: a.title,
          requirement: a.requirement ? `${a.requirement}${VIA}` : `Added${VIA}`,
          source: a.source ?? "",
          valueAed: a.value_aed ?? null,
          ownerIds: a.owner_ids,
          emirate: a.emirate,
        }),
      (x) => x.id,
    );
    return { done: true, dealId: r.id, reusedExistingCustomer: r.reusedCompany ?? undefined, link: link.deal(c, r.id) };
  },
});

const createCustomer = defineTool({
  name: "create_customer",
  title: "Create a customer",
  write: true,
  needs: app("crm", "sales"),
  description: "Add a customer (company) without a deal, optionally with one contact person. Refuses a name that already exists. Ask the user before calling.",
  input: z.object({
    name: z.string().trim().min(2).max(160),
    industry: z.string().max(60).default(""),
    emirate: z.string().max(40).default(""),
    phone: z.string().max(40).default(""),
    website: z.string().max(200).default(""),
    trn: z.string().max(30).default(""),
    address: z.string().max(300).default(""),
    source: z.string().max(60).default(""),
    contact_name: z.string().trim().max(120).default(""),
    contact_email: z.string().trim().max(160).default(""),
    contact_phone: z.string().trim().max(40).default(""),
    contact_job_title: z.string().trim().max(80).default(""),
  }),
  async run(a, c) {
    const id = await asUser(
      c,
      { action: "create_customer", entity: "company", summary: `customer "${a.name}"` },
      async () => {
        const companyId = await createCompany({ name: a.name, industry: a.industry, emirate: a.emirate, phone: a.phone, website: a.website, trn: a.trn, address: a.address, source: a.source, notes: `Added${VIA}` });
        if (a.contact_name) await createContact(companyId, { name: a.contact_name, email: a.contact_email, phone: a.contact_phone, whatsapp: a.contact_phone, jobTitle: a.contact_job_title });
        return companyId;
      },
      (x) => x,
    );
    return { done: true, customerId: id, link: link.customer(c, id) };
  },
});

const createDraftQuote = defineTool({
  name: "create_draft_quote",
  title: "Create a draft quote",
  write: true,
  needs: app("sales", "projects"),
  description:
    "Add lines to a deal (prices in AED before VAT) and make a DRAFT quote from all of the deal's lines. The quote is not sent: the user reviews and sends it from the portal. Fails if the deal already has an open or accepted quote. Ask the user before calling, and never invent prices: use prices the user gave or from products_and_prices.",
  input: z.object({
    deal_id: z.number().int(),
    lines: z
      .array(z.object({ description: z.string().trim().min(1).max(400), qty: z.number().int().min(1), unit_price_aed: z.number().min(0), cost_aed: z.number().min(0).optional() }))
      .max(50)
      .default([])
      .describe("New lines to add first; leave empty to quote the lines already on the deal"),
    valid_days: z.number().int().min(1).max(180).optional(),
  }),
  async run(a, c) {
    const id = a.deal_id;
    const q = await asUser(
      c,
      { action: "create_draft_quote", entity: "quote", summary: `draft quote on deal ${id} (${a.lines.length} new line${a.lines.length === 1 ? "" : "s"})` },
      async () => {
        for (const l of a.lines) await addItem(id, { description: l.description, qty: l.qty, unitPriceAed: l.unit_price_aed, costAed: l.cost_aed ?? null });
        return createQuote(id, { validDays: a.valid_days });
      },
      (x) => x.id,
    );
    const [row] = await db.select({ total: schema.quotes.total, status: schema.quotes.status }).from(schema.quotes).where(eq(schema.quotes.id, q.id));
    return { done: true, quoteId: q.id, number: q.number, status: row?.status, totalWithVatAed: row?.total, link: link.quote(c, q.id) };
  },
});

const pushStock = defineTool({
  name: "push_supplier_stock",
  title: "Push supplier stock from WhatsApp",
  write: true,
  needs: app("procurement"),
  description: [
    "Files supplier stock messages you read in WhatsApp (groups or personal chats) into Procurement, where the team searches prices.",
    "The user asking you to push or read their supplier stock is the go-ahead: no need to confirm each message.",
    "First call supplier_stock_status and read only messages newer than lastMessageAt of that chat.",
    "Send each WhatsApp message that offers products as one entry (up to 20 per call), with the sender exactly as WhatsApp shows them and their number when visible.",
    "Split it into one item per product or configuration. Copy values as written; do not invent prices, specs or part numbers (price null when none is given).",
    "ram_gb is a number (16 for '16GB'). Put the product's original text in line. Skip greetings, 'contact us' lines and messages with no products.",
    "Our server cleans brands and part numbers, finds the supplier (by phone, then name), recognises a message pushed before, and saves clear lines.",
    "Unknown senders and unclear lines wait in the Procurement Inbox for a person. Report the per-message results to the user, with the inbox link when something waits.",
  ].join(" "),
  input: z.object({ messages: z.array(pushedMessageSchema).min(1).max(20) }),
  async run(a, c) {
    const user = { id: c.auth.userId, name: c.auth.name, email: c.auth.email, role: c.auth.role, sv: c.auth.sv, org: c.auth.orgId };
    const results = await runAsClaude(user, () => ingestMessages(c.auth.userId, a.messages));
    const sum = (k: "saved" | "newProducts" | "priceChanges" | "needCheck") => results.reduce((s, r) => s + r[k], 0);
    const totals = { messages: results.length, saved: sum("saved"), newProducts: sum("newProducts"), priceChanges: sum("priceChanges"), needCheck: sum("needCheck"), repeats: results.filter((r) => r.status === "repeat").length, unknownSenders: results.filter((r) => r.status === "unknown_sender").length };
    await audit(db, { userId: c.auth.userId, action: "claude.push_supplier_stock", entity: "price_list", summary: `via Claude: ${totals.messages} WhatsApp message(s), ${totals.saved} lines saved, ${totals.needCheck} to check`, after: totals, orgId: c.auth.orgId });
    return {
      totals,
      results: results.map((r) => ({ ...r, link: r.priceListId ? `${c.base}/procurement/import/${r.priceListId}` : undefined })),
      inbox: totals.needCheck ? `${c.base}/procurement/inbox` : undefined,
      search: `${c.base}/procurement`,
    };
  },
});

export const writeTools: McpTool[] = [createTaskTool, addNote, updateDealTool, createLead, createCustomer, createDraftQuote, pushStock];
