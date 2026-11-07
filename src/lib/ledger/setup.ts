import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { withOrg } from "@/lib/org";
import { regimeFor } from "@/lib/tax/regime";
import type { Tx } from "@/lib/tx";
import { coaTemplate } from "./coa-templates";

const DEFAULT_TEMPLATE: Record<string, string> = { AE_VAT: "ae-trading" };

/**
 * Makes sure an organisation's books exist: chart of accounts (from its template, adding accounts a newer template
 * version brings), the tax codes of its regime with their accounts, a cash and a bank account, and the settings row.
 * Safe to call often: once set up it is one small read. Runs inside the caller's transaction.
 */
export async function ensureLedger(tx: Tx, orgId: number): Promise<void> {
  const read = async () =>
    (await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)).limit(1))[0];
  const [org] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  if (!org) throw new Error(`Organisation ${orgId} not found`);
  let settings = await read();
  const template = coaTemplate(settings?.coaTemplate ?? DEFAULT_TEMPLATE[org.taxRegime] ?? "ae-trading");
  if (settings && settings.coaVersion >= template.version) return;

  // two first visits at the same moment: the second waits here and then finds everything done
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${orgId}, hashtext('ledger_setup'))`);
  settings = await read();
  if (settings && settings.coaVersion >= template.version) return;

  // accounts, parents first (the template lists them that way)
  const existing = new Map(
    (await tx.select({ id: schema.ledgerAccounts.id, code: schema.ledgerAccounts.code, systemKey: schema.ledgerAccounts.systemKey }).from(schema.ledgerAccounts).where(eq(schema.ledgerAccounts.organizationId, orgId))).map(
      (a) => [a.code, a] as const,
    ),
  );
  const takenKeys = new Set([...existing.values()].map((a) => a.systemKey).filter(Boolean));
  for (const a of template.accounts) {
    if (existing.has(a.code)) continue;
    const parentId = a.parent ? existing.get(a.parent)?.id ?? null : null;
    // a key someone already has on another (renumbered) account stays there
    const systemKey = a.systemKey && !takenKeys.has(a.systemKey) ? a.systemKey : null;
    const [row] = await tx
      .insert(schema.ledgerAccounts)
      .values({ organizationId: orgId, code: a.code, name: a.name, type: a.type, subtype: a.subtype ?? (a.group ? "group" : "other"), parentId, isGroup: !!a.group, systemKey, description: a.description ?? "", currency: org.baseCurrency })
      .returning({ id: schema.ledgerAccounts.id });
    existing.set(a.code, { id: row.id, code: a.code, systemKey });
    if (systemKey) takenKeys.add(systemKey);
  }

  // tax codes of the regime, each with its accounts
  const regime = regimeFor(org.taxRegime);
  const keyIds = new Map(
    (await tx.select({ id: schema.ledgerAccounts.id, key: schema.ledgerAccounts.systemKey }).from(schema.ledgerAccounts).where(eq(schema.ledgerAccounts.organizationId, orgId))).map((a) => [a.key, a.id] as const),
  );
  for (const c of regime.codes) {
    const [row] = await tx
      .insert(schema.taxCodes)
      .values({ organizationId: orgId, code: c.code, label: c.label, ratePct: c.ratePct, selfAssessed: c.selfAssessed, saleBoxes: c.boxes.sale, purchaseBoxes: c.boxes.purchase })
      .onConflictDoNothing()
      .returning({ id: schema.taxCodes.id });
    if (!row) continue;
    const acc = template.taxAccounts[c.code] ?? {};
    await tx.insert(schema.taxCodeComponents).values(
      c.components.map((p) => ({
        organizationId: orgId,
        taxCodeId: row.id,
        key: p.key,
        label: p.label,
        share: p.share,
        salesAccountId: acc.sales ? keyIds.get(acc.sales) ?? null : null,
        purchaseAccountId: acc.purchase ? keyIds.get(acc.purchase) ?? null : null,
      })),
    );
  }

  // where money is kept: cash in hand and the company's bank (from Accounts › Settings › Terms and bank details for Zeronix)
  const [anyBank] = await tx.select({ id: schema.bankAccounts.id }).from(schema.bankAccounts).where(eq(schema.bankAccounts.organizationId, orgId)).limit(1);
  if (!anyBank) {
    const bank = orgId === 1 ? await bankSettings(tx) : { bank_name: "", bank_account_number: "", bank_iban: "" };
    const cashId = keyIds.get("cash");
    const bankId = keyIds.get("bank");
    if (bankId && bank.bank_name) await tx.update(schema.ledgerAccounts).set({ name: bank.bank_name }).where(eq(schema.ledgerAccounts.id, bankId));
    if (cashId) await tx.insert(schema.bankAccounts).values({ organizationId: orgId, accountId: cashId, name: "Cash in hand", kind: "cash", currency: org.baseCurrency, isDefault: true });
    if (bankId)
      await tx.insert(schema.bankAccounts).values({
        organizationId: orgId,
        accountId: bankId,
        name: bank.bank_name || "Bank",
        kind: "bank",
        bankName: bank.bank_name,
        accountNumber: bank.bank_account_number,
        iban: bank.bank_iban,
        currency: org.baseCurrency,
        isDefault: true,
      });
  }

  await tx
    .insert(schema.accountingSettings)
    .values({ organizationId: orgId, coaTemplate: template.key, coaVersion: template.version })
    .onConflictDoUpdate({ target: schema.accountingSettings.organizationId, set: { coaTemplate: template.key, coaVersion: template.version, updatedAt: new Date() } });
}

async function bankSettings(tx: Tx) {
  const keys = ["bank_name", "bank_account_number", "bank_iban"] as const;
  const rows = await tx.select().from(schema.settings).where(inArray(schema.settings.key, [...keys]));
  const out = { bank_name: "", bank_account_number: "", bank_iban: "" };
  for (const r of rows) out[r.key as (typeof keys)[number]] = r.value.trim();
  return out;
}

/** For pages: the organisation's books are set up (first visit seeds them). */
export function ledgerReady(orgId: number): Promise<void> {
  return withOrg(orgId, (tx) => ensureLedger(tx, orgId));
}
