"use server";

import { and, count, eq, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { ledgerInUse, ledgerStart, postExistingDocuments, type BackfillResult } from "@/lib/ledger/documents";
import { amount } from "@/lib/ledger/journal";
import { buildOpening, parseTrialBalance, suggestAccount, type Cell, type PartyBalance, type TbRow } from "@/lib/ledger/opening";
import { openingEntry, partyBalancesAt } from "@/lib/ledger/opening-data";
import { postEntry } from "@/lib/ledger/post";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, withOrg } from "@/lib/org";
import { parseCsv } from "@/lib/parse/csv";
import { readWorkbook } from "@/lib/parse/excel-read";
import { addDays, longDay } from "@/lib/quotation";
import { parseInput, UserError } from "@/lib/user-error";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

function refresh() {
  revalidatePath("/accounts/settings/opening");
  revalidatePath("/accounts/journals");
  revalidatePath("/accounts/chart");
}

/**
 * The day the ledger starts: documents from that day on post to it, older balances come from Zoho. It can only move
 * while no documents or opening balances are live in the ledger, and hand journals must still fall on or after it.
 */
export async function setCutover(date: string) {
  const me = await assertAccountant();
  const d = parseInput(day, date);
  if (d > addDays(dubaiToday(), 31)) throw new UserError("The cut-over cannot be more than a month ahead.");
  const orgId = await currentOrgId();
  await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const before = await ledgerStart(tx, orgId);
    if (before !== d && (await ledgerInUse(tx, orgId))) throw new UserError("Documents or opening balances are already in the ledger, so the cut-over date stays as it is.");
    const [{ n: earlier }] = await tx
      .select({ n: count() })
      .from(schema.journalEntries)
      .where(and(eq(schema.journalEntries.organizationId, orgId), eq(schema.journalEntries.sourceType, "manual"), lt(schema.journalEntries.date, d)));
    if (earlier > 0) throw new UserError("Hand journals are dated before that day. Pick an earlier cut-over.");
    await tx.update(schema.accountingSettings).set({ cutoverDate: d, updatedAt: new Date(), updatedBy: me.id }).where(eq(schema.accountingSettings.organizationId, orgId));
    await audit(tx, { userId: me.id, orgId, action: "ledger.cutover", entity: "accounting_settings", entityId: orgId, summary: `Ledger cut-over set to ${longDay(d)}`, before: { cutover: before }, after: { cutover: d } });
  });
  refresh();
}

export interface TbLine extends TbRow {
  accountId: number | null;
}

export interface TbPreview {
  rows: TbLine[];
  customers: PartyBalance[];
  suppliers: PartyBalance[];
}

/** Reads Zoho's trial balance (XLSX or CSV), suggests our account for each line, and returns the portal's open balances to compare. */
export async function readTrialBalance(form: FormData): Promise<TbPreview> {
  await assertAccountant();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserError("Pick the trial balance file.");
  if (file.size > 5_000_000) throw new UserError("That file is too big for a trial balance (over 5 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  let grid: Cell[][];
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") grid = parseCsv(buf.toString("utf8"));
  else {
    const wb = await readWorkbook(buf).catch(() => {
      throw new UserError("That file could not be read. Export the trial balance from Zoho as XLSX or CSV.");
    });
    grid = wb.sheets.find((s) => s.rows.some((r) => r.some((c) => /debit/i.test(String(c ?? "")))))?.rows ?? [];
  }
  const { rows, problem } = parseTrialBalance(grid);
  if (problem) throw new UserError(problem);
  const orgId = await currentOrgId();
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const start = await ledgerStart(tx, orgId);
    if (!start) throw new UserError("Set the cut-over date first.");
    const [settings] = await tx.select({ map: schema.accountingSettings.openingMap }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
    const accounts = await tx
      .select({ id: schema.ledgerAccounts.id, code: schema.ledgerAccounts.code, name: schema.ledgerAccounts.name, systemKey: schema.ledgerAccounts.systemKey })
      .from(schema.ledgerAccounts)
      .where(and(eq(schema.ledgerAccounts.organizationId, orgId), eq(schema.ledgerAccounts.isGroup, false), eq(schema.ledgerAccounts.isActive, true)));
    const { customers, suppliers } = await partyBalancesAt(tx, start);
    return { rows: rows.map((r) => ({ ...r, accountId: suggestAccount(r, accounts, settings?.map ?? {}) })), customers, suppliers };
  });
}

const openingSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        code: z.string().trim().max(40).default(""),
        debit: z.number().min(0).max(1e12),
        credit: z.number().min(0).max(1e12),
        accountId: z.number().int().positive("Pick our account for every Zoho line"),
      }),
    )
    .min(1, "The trial balance has no lines")
    .max(1000),
});

/**
 * Posts the opening entry, dated the day before the cut-over. Receivables and payables are split per customer and
 * supplier from the portal's open invoices and bills; the mapping is remembered for a second import.
 */
export async function postOpeningBalances(input: z.input<typeof openingSchema>) {
  const me = await assertAccountant();
  const d = parseInput(openingSchema, input);
  const orgId = await currentOrgId();
  const r = await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const start = await ledgerStart(tx, orgId);
    if (!start) throw new UserError("Set the cut-over date first.");
    const live = await openingEntry(tx, orgId);
    if (live) throw new UserError(`Opening balances are already posted (${live.number}). Reverse that entry first to post them again.`);
    const keyed = await tx
      .select({ id: schema.ledgerAccounts.id, key: schema.ledgerAccounts.systemKey })
      .from(schema.ledgerAccounts)
      .where(eq(schema.ledgerAccounts.organizationId, orgId));
    const idOf = (k: string) => {
      const a = keyed.find((x) => x.key === k);
      if (!a) throw new UserError(`The books have no "${k}" account.`);
      return a.id;
    };
    const { customers, suppliers } = await partyBalancesAt(tx, start);
    const plan = buildOpening({ rows: d.rows, arAccountId: idOf("ar"), apAccountId: idOf("ap"), equityAccountId: idOf("opening_equity"), customers, suppliers });
    const posted = await postEntry(tx, {
      orgId,
      date: addDays(start, -1),
      sourceType: "opening",
      memo: `Opening balances from Zoho on ${longDay(addDays(start, -1))}`,
      createdBy: me.id,
      lines: plan.lines,
    });
    const map = Object.fromEntries(d.rows.map((x) => [x.name, x.accountId]));
    await tx.update(schema.accountingSettings).set({ openingMap: map, updatedAt: new Date(), updatedBy: me.id }).where(eq(schema.accountingSettings.organizationId, orgId));
    await audit(tx, {
      userId: me.id,
      orgId,
      action: "ledger.opening",
      entity: "journal_entry",
      entityId: posted.id,
      summary: `Opening balances posted as ${posted.number}${plan.imbalance ? `, trial balance off by ${amount(plan.imbalance)}` : ""}`,
      after: { lines: d.rows.length, arUnmatched: plan.arUnmatched, apUnmatched: plan.apUnmatched, imbalance: plan.imbalance },
    });
    return { ...posted, arUnmatched: plan.arUnmatched, apUnmatched: plan.apUnmatched, imbalance: plan.imbalance };
  });
  refresh();
  return r;
}

/** What "Post existing documents" would do, without doing it. */
export async function previewExistingDocuments(): Promise<BackfillResult> {
  const me = await assertAccountant();
  const orgId = await currentOrgId();
  return withOrg(orgId, (tx) => postExistingDocuments(tx, orgId, me.id, true));
}

/** Posts every invoice, credit note, payment, bill and expense since the cut-over that is not in the ledger yet. */
export async function postExisting(): Promise<BackfillResult> {
  const me = await assertAccountant();
  const orgId = await currentOrgId();
  const r = await withOrg(orgId, async (tx) => {
    const res = await postExistingDocuments(tx, orgId, me.id);
    await audit(tx, { userId: me.id, orgId, action: "ledger.backfill", entity: "accounting_settings", entityId: orgId, summary: `${res.posted} entries posted for documents since ${longDay(res.start)}`, after: res });
    return res;
  });
  refresh();
  return r;
}
