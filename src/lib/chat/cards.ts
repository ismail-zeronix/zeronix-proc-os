import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Access } from "@/lib/auth/session";
import { canSeeCompany, canSeeDeal, financeViewerOf, viewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { invoiceState, orderStatusLabel } from "@/lib/invoicing";
import { quoteStatusLabel } from "@/lib/quotation";
import { aed, stageLabel, temperature, TEMPERATURE_LABEL } from "@/lib/sales";
import type { CardTone, CardView } from "./types";

/** Record types a card can show. */
export const CARD_TYPES = ["deal", "quote", "order", "invoice", "company", "product", "task", "chat"] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const isCardType = (t: string): t is CardType => (CARD_TYPES as readonly string[]).includes(t);

const STAGE_TONE: Record<string, CardTone> = { won: "green", lost: "slate", quoted: "violet", negotiation: "amber" };
const QUOTE_TONE: Record<string, CardTone> = { draft: "slate", sent: "blue", accepted: "green", rejected: "red", expired: "slate" };
const ORDER_TONE: Record<string, CardTone> = { open: "blue", delivered: "violet", invoiced: "green", cancelled: "slate" };
const INVOICE_TONE: Record<string, CardTone> = { unpaid: "blue", part: "amber", overdue: "red", paid: "green", cancelled: "slate" };

const restricted = (type: string, id: number): CardView => ({ ref: `${type}:${id}`, type, id, restricted: true, title: "" });
const missing = (type: string, id: number): CardView => ({ ref: `${type}:${id}`, type, id, missing: true, title: "" });

/** "deal:12" → { type, id }, or null for anything else. */
export function parseRef(ref: string): { type: CardType; id: number } | null {
  const m = /^([a-z]+):(\d+)$/.exec(ref);
  if (!m || !isCardType(m[1])) return null;
  const id = Number(m[2]);
  return Number.isSafeInteger(id) && id > 0 ? { type: m[1], id } : null;
}

/**
 * Reads records for cards, as the given person may see them: deals (and their quotes and orders) by the deal rules,
 * companies by the company rules, invoices for Accounts or the deal's team, products for Procurement users, tasks for
 * their assignee, creator, admins and anyone mentioned in them, chat messages for people in that conversation.
 */
export async function resolveCards(access: Access, refs: string[]): Promise<CardView[]> {
  const v = viewerOf(access);
  const today = dubaiToday();
  const out: CardView[] = [];
  for (const ref of [...new Set(refs)].slice(0, 40)) {
    const r = parseRef(ref);
    if (!r) continue;
    out.push(await resolveOne(access, r.type, r.id, today).catch(() => missing(r.type, r.id)));
  }
  return out;

  async function resolveOne(a: Access, type: CardType, id: number, today: string): Promise<CardView> {
    const ref = `${type}:${id}`;
    switch (type) {
      case "deal": {
        const [d] = await db
          .select({
            title: schema.deals.title,
            stage: schema.deals.stage,
            valueAed: schema.deals.valueAed,
            checks: schema.deals.checks,
            company: schema.companies.name,
            projectId: schema.projects.id,
          })
          .from(schema.deals)
          .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
          .leftJoin(schema.projects, eq(schema.projects.dealId, schema.deals.id))
          .where(eq(schema.deals.id, id));
        if (!d) return missing(type, id);
        if (!(await canSeeDeal(v, id))) return restricted(type, id);
        const people = await db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.dealAssignees)
          .innerJoin(schema.users, eq(schema.users.id, schema.dealAssignees.userId))
          .where(eq(schema.dealAssignees.dealId, id))
          .orderBy(schema.dealAssignees.position);
        const temp = temperature(d.checks);
        return {
          ref,
          type,
          id,
          title: d.title,
          subtitle: d.company,
          href: d.projectId && a.apps.includes("projects") && !a.apps.includes("crm") ? `/projects/list/${d.projectId}` : `/crm/deals/${id}`,
          status: { label: stageLabel(d.stage), tone: STAGE_TONE[d.stage] ?? "blue" },
          amount: d.valueAed != null ? aed(d.valueAed) : undefined,
          facts: [`${TEMPERATURE_LABEL[temp]} lead`],
          people,
          actions: a.apps.includes("tasks") && a.apps.includes("crm") ? [{ key: "followup", label: "Follow-up task" }] : [],
        };
      }
      case "quote": {
        const [q] = await db
          .select({ number: schema.quotes.number, status: schema.quotes.status, total: schema.quotes.total, validUntil: schema.quotes.validUntil, dealId: schema.quotes.dealId, title: schema.deals.title, company: schema.companies.name })
          .from(schema.quotes)
          .innerJoin(schema.deals, eq(schema.deals.id, schema.quotes.dealId))
          .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
          .where(eq(schema.quotes.id, id));
        if (!q) return missing(type, id);
        if (!(await canSeeDeal(financeViewerOf(a), q.dealId))) return restricted(type, id);
        return {
          ref,
          type,
          id,
          title: q.number,
          subtitle: `${q.company} · ${q.title}`,
          href: `/accounts/quotes/${id}`,
          status: { label: quoteStatusLabel(q.status), tone: QUOTE_TONE[q.status] ?? "slate" },
          amount: aed(q.total),
          facts: q.validUntil && (q.status === "draft" || q.status === "sent") ? [`Valid until ${dayLabel(q.validUntil, today)}`] : [],
          actions: !a.apps.includes("accounts")
            ? []
            : q.status === "draft"
              ? [{ key: "sent", label: "Mark sent" }]
              : q.status === "sent"
                ? [
                    { key: "accepted", label: "Accepted" },
                    { key: "rejected", label: "Rejected" },
                  ]
                : [],
        };
      }
      case "order": {
        const [o] = await db
          .select({ number: schema.salesOrders.number, status: schema.salesOrders.status, total: schema.salesOrders.total, dealId: schema.salesOrders.dealId, dn: schema.salesOrders.dnNumber, company: schema.companies.name })
          .from(schema.salesOrders)
          .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
          .where(eq(schema.salesOrders.id, id));
        if (!o) return missing(type, id);
        if (!(await canSeeDeal(financeViewerOf(a), o.dealId))) return restricted(type, id);
        return {
          ref,
          type,
          id,
          title: o.number,
          subtitle: o.company,
          href: `/accounts/orders/${id}`,
          status: { label: orderStatusLabel(o.status), tone: ORDER_TONE[o.status] ?? "blue" },
          amount: aed(o.total),
          facts: o.dn ? [`Delivery note ${o.dn}`] : [],
          actions: a.apps.includes("accounts") && o.status === "open" ? [{ key: "delivered", label: "Mark delivered today" }] : [],
        };
      }
      case "invoice": {
        const [i] = await db
          .select({ number: schema.invoices.number, status: schema.invoices.status, total: schema.invoices.total, dueDate: schema.invoices.dueDate, dealId: schema.invoices.dealId, customer: schema.invoices.customerName })
          .from(schema.invoices)
          .where(eq(schema.invoices.id, id));
        if (!i) return missing(type, id);
        const finance = a.seesAll || a.finance;
        if (!finance && !(i.dealId && (await canSeeDeal(v, i.dealId)))) return restricted(type, id);
        const [paid] = await db
          .select({ s: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::float` })
          .from(schema.payments)
          .where(and(eq(schema.payments.invoiceId, id), isNull(schema.payments.voidedAt)));
        const st = invoiceState(i, paid?.s ?? 0, today);
        return {
          ref,
          type,
          id,
          title: i.number,
          subtitle: i.customer,
          href: a.finance ? `/accounts/invoices/${id}` : `/print/invoice/${id}`,
          status: { label: st.label, tone: INVOICE_TONE[st.key] ?? "blue" },
          amount: aed(i.total),
          facts: st.balance > 0 && st.paid > 0 ? [`${aed(st.balance)} still owed`] : [],
        };
      }
      case "company": {
        const [c] = await db
          .select({ name: schema.companies.name, emirate: schema.companies.emirate, industry: schema.companies.industry, owner: schema.users.name })
          .from(schema.companies)
          .leftJoin(schema.users, eq(schema.users.id, schema.companies.ownerId))
          .where(eq(schema.companies.id, id));
        if (!c) return missing(type, id);
        if (!(await canSeeCompany(v, id))) return restricted(type, id);
        return {
          ref,
          type,
          id,
          title: c.name,
          subtitle: [c.industry, c.emirate].filter(Boolean).join(" · ") || "Company",
          href: `/crm/companies/${id}`,
          facts: c.owner ? [`Owner: ${c.owner}`] : [],
        };
      }
      case "product": {
        if (!a.apps.includes("procurement")) return restricted(type, id);
        const [p] = await db
          .select({ brand: schema.products.brand, modelName: schema.products.modelName, partNumber: schema.products.partNumber, specSummary: schema.products.specSummary })
          .from(schema.products)
          .where(eq(schema.products.id, id));
        if (!p) return missing(type, id);
        // cheapest price in the last 14 days, USD counted at the usual rate so the two compare
        const best = await db.execute<{ price: number; currency: string; supplier: string; suppliers: number }>(sql`
          SELECT o.price::float AS price, o.currency, s.name AS supplier,
            (SELECT count(DISTINCT o2.supplier_id)::int FROM offers o2 WHERE o2.product_id = ${id} AND o2.price IS NOT NULL AND o2.received_at > now() - interval '14 days') AS suppliers
          FROM offers o JOIN suppliers s ON s.id = o.supplier_id
          WHERE o.product_id = ${id} AND o.price IS NOT NULL AND o.received_at > now() - interval '14 days'
          ORDER BY CASE WHEN o.currency = 'USD' THEN o.price * 3.6725 ELSE o.price END ASC
          LIMIT 1
        `);
        const b = best.rows[0];
        return {
          ref,
          type,
          id,
          title: [p.brand, p.modelName].filter(Boolean).join(" ") || p.partNumber,
          subtitle: [p.partNumber, p.specSummary].filter(Boolean).join(" · "),
          href: `/procurement/products/${id}`,
          amount: b ? `${b.currency} ${b.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : undefined,
          facts: b ? [`Best of ${b.suppliers} supplier${b.suppliers === 1 ? "" : "s"}: ${b.supplier}`] : ["No price in the last 14 days"],
        };
      }
      case "task": {
        const [t] = await db
          .select({ title: schema.tasks.title, notes: schema.tasks.notes, status: schema.tasks.status, dueDate: schema.tasks.dueDate, priority: schema.tasks.priority, assignedTo: schema.tasks.assignedTo, createdBy: schema.tasks.createdBy, assignee: schema.users.name })
          .from(schema.tasks)
          .innerJoin(schema.users, eq(schema.users.id, schema.tasks.assignedTo))
          .where(eq(schema.tasks.id, id));
        if (!t) return missing(type, id);
        const mentioned = t.notes.includes(`](user:${a.user.id})`);
        if (a.user.role !== "admin" && t.assignedTo !== a.user.id && t.createdBy !== a.user.id && !mentioned) return restricted(type, id);
        const done = t.status === "done";
        const overdue = !done && !!t.dueDate && t.dueDate < today;
        return {
          ref,
          type,
          id,
          title: t.title,
          subtitle: "Task",
          href: "/tasks",
          status: done ? { label: "Done", tone: "green" } : overdue ? { label: "Overdue", tone: "red" } : { label: t.priority === "high" ? "Open · high" : "Open", tone: t.priority === "high" ? "amber" : "blue" },
          facts: t.dueDate ? [`Due ${dayLabel(t.dueDate, today)}`] : [],
          people: [{ id: t.assignedTo, name: t.assignee }],
          // only the people who may change the task (as on the Tasks page)
          actions:
            a.apps.includes("tasks") && (a.user.role === "admin" || t.assignedTo === a.user.id || t.createdBy === a.user.id)
              ? [done ? { key: "reopen", label: "Reopen" } : { key: "done", label: "Mark done" }]
              : [],
        };
      }
      case "chat": {
        const [m] = await db
          .select({ channelId: schema.chatMessages.channelId, kind: schema.chatChannels.kind, name: schema.chatChannels.name, deletedAt: schema.chatMessages.deletedAt, title: schema.deals.title })
          .from(schema.chatMessages)
          .innerJoin(schema.chatChannels, eq(schema.chatChannels.id, schema.chatMessages.channelId))
          .leftJoin(schema.deals, and(eq(schema.chatChannels.recordType, "deal"), eq(schema.deals.id, schema.chatChannels.recordId)))
          .where(eq(schema.chatMessages.id, id));
        if (!m || m.deletedAt) return missing(type, id);
        const [member] = await db
          .select({ u: schema.chatMembers.userId })
          .from(schema.chatMembers)
          .where(and(eq(schema.chatMembers.channelId, m.channelId), eq(schema.chatMembers.userId, a.user.id)));
        if (!member) return restricted(type, id);
        return { ref, type, id, title: m.kind === "record" ? (m.title ?? "Deal thread") : `#${m.name}`, subtitle: m.kind === "record" ? "Deal thread" : "Channel", channelId: m.channelId };
      }
    }
  }
}

/** Which of these users may see the record (used to warn before mentioning someone who cannot). */
export async function whoCanSee(record: { type: CardType; id: number }, userIds: number[]): Promise<Set<number>> {
  if (!userIds.length) return new Set();
  const users = await db
    .select({ id: schema.users.id, role: schema.users.role, dataScope: schema.users.dataScope, apps: schema.users.apps })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  const ok = new Set<number>();
  for (const u of users) {
    const v = { id: u.id, seesAll: u.role === "admin" || u.dataScope === "all" };
    let can = false;
    if (record.type === "deal") can = await canSeeDeal(v, record.id);
    else if (record.type === "company") can = await canSeeCompany(v, record.id);
    else can = true;
    if (can) ok.add(u.id);
  }
  return ok;
}
