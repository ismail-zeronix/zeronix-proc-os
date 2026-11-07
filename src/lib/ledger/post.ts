import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { takeSeriesNumber } from "@/lib/doc-numbers";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { fiscalYearOf } from "@/lib/org";
import { addDays, longDay } from "@/lib/quotation";
import type { Tx } from "@/lib/tx";
import { journalProblem } from "./journal";
import { ensureLedger } from "./setup";
import { UserError } from "@/lib/user-error";

export interface PostLine {
  /** Account id, or the system key of one ("ar", "vat_output", "exp_rent"...). */
  account: number | string;
  debit?: number;
  credit?: number;
  description?: string;
  partyType?: "customer" | "supplier" | null;
  partyId?: number | null;
  /** Tax code ("SR", "ZR"...) and the taxable amount, for lines that feed the VAT return. */
  taxCode?: string | null;
  taxBase?: number | null;
  orderId?: number | null;
  dealId?: number | null;
  projectId?: number | null;
}

export interface PostInput {
  orgId: number;
  date: string;
  sourceType: string;
  sourceId?: number | null;
  /** What the document posts ("post", "cogs"...). Unique per document, so posting twice does nothing new. */
  purpose?: string;
  memo?: string;
  lines: readonly PostLine[];
  createdBy?: number | null;
  reversalOfId?: number | null;
}

export interface Posted {
  id: number;
  number: string;
}

/**
 * Posts one balanced journal entry inside the caller's transaction (the one saving the document), numbered from the
 * JV series of its fiscal year. The database checks the same rules again at commit (balance, lock date, group
 * accounts); here they fail early with a message people understand.
 */
export async function postEntry(tx: Tx, input: PostInput): Promise<Posted> {
  const problem = journalProblem(input.lines);
  if (problem) throw new UserError(problem);
  const { orgId } = input;
  await ensureLedger(tx, orgId);

  const [settings] = await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
  if (settings?.lockDate && input.date <= settings.lockDate) {
    throw new UserError(`The books are locked up to ${longDay(settings.lockDate)}. Date it ${longDay(addDays(settings.lockDate, 1))} or later, or ask an accountant.`);
  }

  // Settings › Posting accounts can point a sales type or expense category at another account
  const pointed = (ref: number | string): number | string => (typeof ref === "string" ? (settings?.accountMap?.[ref] ?? ref) : ref);
  // accounts by id or system key, all of this organisation, leaf and (except for reversals) active
  const refs = input.lines.map((l) => pointed(l.account));
  const ids = [...new Set(refs.filter((a): a is number => typeof a === "number"))];
  const keys = [...new Set(refs.filter((a): a is string => typeof a === "string"))];
  const cols = { id: schema.ledgerAccounts.id, code: schema.ledgerAccounts.code, name: schema.ledgerAccounts.name, systemKey: schema.ledgerAccounts.systemKey, isGroup: schema.ledgerAccounts.isGroup, isActive: schema.ledgerAccounts.isActive };
  const org = eq(schema.ledgerAccounts.organizationId, orgId);
  const found = [
    ...(ids.length ? await tx.select(cols).from(schema.ledgerAccounts).where(and(org, inArray(schema.ledgerAccounts.id, ids))) : []),
    ...(keys.length ? await tx.select(cols).from(schema.ledgerAccounts).where(and(org, inArray(schema.ledgerAccounts.systemKey, keys))) : []),
  ];
  const byId = new Map(found.map((a) => [a.id, a]));
  const byKey = new Map(found.filter((a) => a.systemKey).map((a) => [a.systemKey as string, a]));
  const resolve = (ref: number | string) => {
    const a = typeof ref === "number" ? byId.get(ref) : byKey.get(ref);
    if (!a) throw new UserError(typeof ref === "number" ? "One of the accounts no longer exists." : `The books have no "${ref}" account. An accountant should check the chart of accounts.`);
    if (a.isGroup) throw new UserError(`${a.code} ${a.name} is a group: pick one of the accounts under it.`);
    if (!a.isActive && !input.reversalOfId) throw new UserError(`${a.code} ${a.name} is switched off. Switch it on in the chart of accounts, or pick another.`);
    return a.id;
  };

  const codes = [...new Set(input.lines.map((l) => l.taxCode).filter((c): c is string => !!c))];
  const taxIds = new Map(
    codes.length
      ? (await tx.select({ id: schema.taxCodes.id, code: schema.taxCodes.code }).from(schema.taxCodes).where(and(eq(schema.taxCodes.organizationId, orgId), inArray(schema.taxCodes.code, codes)))).map((t) => [t.code, t.id] as const)
      : [],
  );
  for (const c of codes) if (!taxIds.has(c)) throw new UserError(`Unknown tax code ${c}.`);

  const [o] = await tx.select({ fy: schema.organizations.fiscalYearStartMonth, currency: schema.organizations.baseCurrency }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
  const { number } = await takeSeriesNumber(tx, { orgId, key: "journal", prefix: "JV", fiscalYear: fiscalYearOf(input.date, o.fy) });
  const total = fromMinor(sumMinor(input.lines.map((l) => toMinor(l.debit ?? 0))));

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      organizationId: orgId,
      number,
      date: input.date,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      purpose: input.purpose ?? "post",
      memo: input.memo ?? "",
      reversalOfId: input.reversalOfId ?? null,
      total,
      currency: o.currency,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: schema.journalEntries.id });

  await tx.insert(schema.journalLines).values(
    input.lines.map((l, i) => ({
      organizationId: orgId,
      entryId: entry.id,
      lineNo: i + 1,
      accountId: resolve(pointed(l.account)),
      debit: fromMinor(toMinor(l.debit ?? 0)),
      credit: fromMinor(toMinor(l.credit ?? 0)),
      currency: o.currency,
      description: l.description ?? "",
      partyType: l.partyType ?? null,
      partyId: l.partyId ?? null,
      taxCodeId: l.taxCode ? taxIds.get(l.taxCode) : null,
      taxBase: l.taxBase == null ? null : fromMinor(toMinor(l.taxBase)),
      orderId: l.orderId ?? null,
      dealId: l.dealId ?? null,
      projectId: l.projectId ?? null,
    })),
  );
  return { id: entry.id, number };
}

/**
 * Undoes an entry with its mirror image (debits become credits). Dated like the original while that period is open,
 * otherwise on the first open day; an entry is reversed once, and a reversal is never reversed.
 */
export async function reverseEntry(tx: Tx, p: { orgId: number; entryId: number; reason: string; date?: string; createdBy?: number | null }): Promise<Posted> {
  const [e] = await tx
    .select()
    .from(schema.journalEntries)
    .where(and(eq(schema.journalEntries.id, p.entryId), eq(schema.journalEntries.organizationId, p.orgId)))
    .for("update");
  if (!e) throw new UserError("That journal entry no longer exists.");
  if (e.reversalOfId) throw new UserError(`${e.number} is itself a reversal. Post a new journal instead.`);
  const [done] = await tx.select({ number: schema.journalEntries.number }).from(schema.journalEntries).where(eq(schema.journalEntries.reversalOfId, e.id));
  if (done) throw new UserError(`${e.number} was already reversed by ${done.number}.`);
  const lines = await tx
    .select({ line: schema.journalLines, taxCode: schema.taxCodes.code })
    .from(schema.journalLines)
    .leftJoin(schema.taxCodes, eq(schema.taxCodes.id, schema.journalLines.taxCodeId))
    .where(eq(schema.journalLines.entryId, e.id))
    .orderBy(schema.journalLines.lineNo);

  let date = p.date ?? e.date;
  if (!p.date) {
    const [s] = await tx.select({ lockDate: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, p.orgId));
    if (s?.lockDate && date <= s.lockDate) date = addDays(s.lockDate, 1);
  }
  return postEntry(tx, {
    orgId: p.orgId,
    date,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    purpose: `${e.purpose}:rev`,
    memo: `Reversal of ${e.number}: ${p.reason}`,
    reversalOfId: e.id,
    createdBy: p.createdBy,
    // same accounts, parties and tax codes, sides swapped and taxable amounts negative: the VAT return nets them out
    lines: lines.map(({ line: l, taxCode }) => ({
      account: l.accountId,
      debit: l.credit,
      credit: l.debit,
      description: l.description,
      partyType: l.partyType,
      partyId: l.partyId,
      taxCode,
      taxBase: l.taxBase == null ? null : -l.taxBase,
      orderId: l.orderId,
      dealId: l.dealId,
      projectId: l.projectId,
    })),
  });
}
