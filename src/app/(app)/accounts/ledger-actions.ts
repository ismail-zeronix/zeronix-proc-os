"use server";

import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { inventoryBalance } from "@/lib/ledger/data";
import { ledgerStart } from "@/lib/ledger/documents";
import { amount, journalProblem, MANUAL_SOURCES, partyNeededFor } from "@/lib/ledger/journal";
import { postEntry, reverseEntry } from "@/lib/ledger/post";
import { closingStockLines } from "@/lib/ledger/rules";
import { longDay } from "@/lib/quotation";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, withOrg } from "@/lib/org";
import { parseInput, UserError } from "@/lib/user-error";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

const accountSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z.-]{1,12}$/, "Code: up to 12 letters, digits, dots or dashes"),
  name: z.string().trim().min(2, "Enter the account name").max(120),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  parentId: z.number().int().positive().nullable(),
  isGroup: z.boolean().default(false),
  isActive: z.boolean().default(true),
  description: z.string().trim().max(300).default(""),
});
export type AccountInput = z.input<typeof accountSchema>;

/**
 * Adds an account, or changes one. Accounts are never deleted: switch them off instead. An account the portal posts to
 * by itself (system key) keeps its type and stays on; one with postings keeps its type and cannot become a group.
 */
export async function saveAccount(id: number | null, input: AccountInput) {
  const me = await assertAccountant();
  const d = parseInput(accountSchema, input);
  const orgId = await currentOrgId();
  const a = schema.ledgerAccounts;
  const saved = await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const [dup] = await tx
      .select({ name: a.name })
      .from(a)
      .where(and(eq(a.organizationId, orgId), eq(a.code, d.code), id ? ne(a.id, id) : undefined));
    if (dup) throw new UserError(`Code ${d.code} is already used by ${dup.name}.`);
    if (d.parentId) {
      const [p] = await tx.select().from(a).where(and(eq(a.id, d.parentId), eq(a.organizationId, orgId)));
      if (!p) throw new UserError("That parent account no longer exists.");
      if (!p.isGroup) throw new UserError(`${p.code} ${p.name} is not a group: pick a group to put the account under.`);
      if (p.type !== d.type) throw new UserError(`${p.code} ${p.name} holds ${p.type} accounts: the new account must be one too.`);
      // walking up from the new parent must never reach the account itself (no loops)
      for (let up: number | null = p.id, steps = 0; up && id && steps < 50; steps++) {
        if (up === id) throw new UserError("An account cannot sit under itself or one of its own accounts.");
        const [next] = await tx.select({ parentId: a.parentId }).from(a).where(eq(a.id, up));
        up = next?.parentId ?? null;
      }
    }
    if (!id) {
      const [row] = await tx
        .insert(a)
        .values({ organizationId: orgId, code: d.code, name: d.name, type: d.type, parentId: d.parentId, isGroup: d.isGroup, isActive: d.isActive, description: d.description, subtype: d.isGroup ? "group" : "other" })
        .returning({ id: a.id });
      await audit(tx, { userId: me.id, orgId, action: "account.create", entity: "account", entityId: row.id, summary: `Account ${d.code} ${d.name} added`, after: d });
      return row.id;
    }
    const [old] = await tx.select().from(a).where(and(eq(a.id, id), eq(a.organizationId, orgId))).for("update");
    if (!old) throw new UserError("That account no longer exists.");
    const [{ n: lines }] = await tx.select({ n: count() }).from(schema.journalLines).where(eq(schema.journalLines.accountId, id));
    const [{ n: children }] = await tx.select({ n: count() }).from(a).where(eq(a.parentId, id));
    if (old.type !== d.type && (old.systemKey || lines > 0 || children > 0)) {
      throw new UserError(old.systemKey ? "The portal posts to this account by itself: its type stays as it is." : "This account has postings or accounts under it: its type stays as it is.");
    }
    if (old.isGroup !== d.isGroup) {
      if (d.isGroup && lines > 0) throw new UserError("This account has postings, so it cannot become a group.");
      if (!d.isGroup && children > 0) throw new UserError("Accounts sit under this group: move them first.");
      if (d.isGroup && old.systemKey) throw new UserError("The portal posts to this account by itself: it cannot become a group.");
    }
    if (!d.isActive && old.systemKey) throw new UserError("The portal posts to this account by itself: it stays switched on.");
    if (!d.isActive && old.isActive) {
      const [{ b }] = await tx.select({ b: sql<number>`coalesce(sum(${schema.journalLines.debit} - ${schema.journalLines.credit}), 0)::float` }).from(schema.journalLines).where(eq(schema.journalLines.accountId, id));
      if (Math.abs(b) >= 0.005) throw new UserError("This account still has a balance: move it to another account with a journal before switching it off.");
    }
    await tx
      .update(a)
      .set({ code: d.code, name: d.name, type: d.type, parentId: d.parentId, isGroup: d.isGroup, isActive: d.isActive, description: d.description, updatedAt: new Date() })
      .where(eq(a.id, id));
    await audit(tx, {
      userId: me.id,
      orgId,
      action: "account.update",
      entity: "account",
      entityId: id,
      summary: `Account ${d.code} ${d.name} changed`,
      before: { code: old.code, name: old.name, type: old.type, parentId: old.parentId, isGroup: old.isGroup, isActive: old.isActive, description: old.description },
      after: d,
    });
    return id;
  });
  revalidatePath("/accounts/chart");
  return { id: saved };
}

const journalSchema = z.object({
  date: day,
  memo: z.string().trim().min(3, "Say what the journal is for").max(300),
  lines: z
    .array(
      z.object({
        accountId: z.number().int().positive("Pick an account on every line"),
        description: z.string().trim().max(300).default(""),
        debit: z.number().min(0).max(1e12).default(0),
        credit: z.number().min(0).max(1e12).default(0),
        /** Customer or supplier, on the accounts that add up what each one owes. */
        partyId: z.number().int().positive().nullable().optional(),
      }),
    )
    .min(2, "A journal needs at least two lines")
    .max(200),
});
export type JournalInput = z.input<typeof journalSchema>;

/** Posts a journal by hand (accruals, corrections, owner money, depreciation...). It cannot be edited afterwards, only reversed. */
export async function postJournal(input: JournalInput) {
  const me = await assertAccountant();
  const d = parseInput(journalSchema, input);
  if (d.date > dubaiToday()) throw new UserError("The journal date cannot be in the future.");
  const problem = journalProblem(d.lines);
  if (problem) throw new UserError(problem);
  const orgId = await currentOrgId();
  const r = await withOrg(orgId, async (tx) => {
    const start = await ledgerStart(tx, orgId);
    if (!start) throw new UserError("Set the cut-over date in Settings › Opening balances first: it is the day the ledger starts.");
    if (d.date < start) throw new UserError(`The ledger starts on ${longDay(start)}. Balances from before that belong in the opening entry.`);
    const accounts = await tx
      .select({ id: schema.ledgerAccounts.id, code: schema.ledgerAccounts.code, name: schema.ledgerAccounts.name, systemKey: schema.ledgerAccounts.systemKey })
      .from(schema.ledgerAccounts)
      .where(and(eq(schema.ledgerAccounts.organizationId, orgId), inArray(schema.ledgerAccounts.id, d.lines.map((l) => l.accountId))));
    const lines = [];
    for (const l of d.lines) {
      const acc = accounts.find((a) => a.id === l.accountId);
      const need = partyNeededFor(acc?.systemKey);
      if (acc && need && !l.partyId) throw new UserError(`${acc.code} ${acc.name}: say which ${need} this line is for, so their statement stays right.`);
      lines.push({ account: l.accountId, debit: l.debit, credit: l.credit, description: l.description, partyType: need, partyId: need ? l.partyId : null });
    }
    const posted = await postEntry(tx, { orgId, date: d.date, sourceType: "manual", memo: d.memo, createdBy: me.id, lines });
    const total = d.lines.reduce((s, l) => s + l.debit, 0);
    await audit(tx, { userId: me.id, orgId, action: "journal.post", entity: "journal_entry", entityId: posted.id, summary: `${posted.number} posted: ${d.memo} (${amount(total)})`, after: d });
    return posted;
  });
  revalidatePath("/accounts/journals");
  revalidatePath("/accounts/chart");
  return r;
}

/** Undoes a journal posted by hand with its mirror image. Entries made by documents are undone by voiding the document. */
export async function reverseJournal(entryId: number, input: { reason: string; date?: string | null }) {
  const me = await assertAccountant();
  const reason = parseInput(z.string().trim().min(3, "Say why it is reversed").max(300), input.reason);
  const date = input.date ? day.parse(input.date) : undefined;
  if (date && date > dubaiToday()) throw new UserError("The reversal date cannot be in the future.");
  const orgId = await currentOrgId();
  const r = await withOrg(orgId, async (tx) => {
    const [e] = await tx
      .select({ sourceType: schema.journalEntries.sourceType, number: schema.journalEntries.number, date: schema.journalEntries.date })
      .from(schema.journalEntries)
      .where(and(eq(schema.journalEntries.id, entryId), eq(schema.journalEntries.organizationId, orgId)));
    if (!e) throw new UserError("That journal entry no longer exists.");
    if (!MANUAL_SOURCES.has(e.sourceType)) throw new UserError(`${e.number} was posted by a document. Void or cancel the document instead, and its entry is reversed with it.`);
    if (date && date < e.date) throw new UserError("A reversal cannot be dated before the entry it undoes.");
    const posted = await reverseEntry(tx, { orgId, entryId, reason, date, createdBy: me.id });
    await audit(tx, { userId: me.id, orgId, action: "journal.reverse", entity: "journal_entry", entityId: entryId, summary: `${e.number} reversed by ${posted.number}: ${reason}`, after: { reversal: posted.number, reason } });
    return posted;
  });
  revalidatePath("/accounts/journals");
  revalidatePath(`/accounts/journals/${entryId}`);
  revalidatePath("/accounts/chart");
  return r;
}

const closingStockSchema = z.object({
  date: day,
  value: z.number().min(0, "Stock cannot be worth less than zero").max(1e12),
});

/**
 * The month-end stock count: an accountant says what the stock is worth on a day, and one entry moves the difference
 * between Inventory and cost of goods sold. Undone like any hand-posted entry, by reversing it.
 */
export async function postClosingStock(input: z.input<typeof closingStockSchema>) {
  const me = await assertAccountant();
  const d = parseInput(closingStockSchema, input);
  if (d.date > dubaiToday()) throw new UserError("The stock date cannot be in the future.");
  const orgId = await currentOrgId();
  const r = await withOrg(orgId, async (tx) => {
    const start = await ledgerStart(tx, orgId);
    if (!start) throw new UserError("Set the cut-over date in Settings › Opening balances first: it is the day the ledger starts.");
    if (d.date < start) throw new UserError(`The ledger starts on ${longDay(start)}. Pick a date from then on.`);
    const book = await inventoryBalance(tx, orgId, d.date);
    const memo = `Closing stock on ${longDay(d.date)}: counted ${amount(d.value)}, books ${amount(book)}`;
    const lines = closingStockLines(book, d.value, memo);
    if (!lines) throw new UserError(`Inventory already shows ${amount(book)} on that day: nothing to post.`);
    const posted = await postEntry(tx, { orgId, date: d.date, sourceType: "stock_count", memo, createdBy: me.id, lines });
    await audit(tx, { userId: me.id, orgId, action: "stock.count", entity: "journal_entry", entityId: posted.id, summary: `${posted.number}: ${memo}`, after: { date: d.date, counted: d.value, book } });
    return posted;
  });
  revalidatePath("/accounts/closing-stock");
  revalidatePath("/accounts/journals");
  revalidatePath("/accounts/chart");
  return r;
}
