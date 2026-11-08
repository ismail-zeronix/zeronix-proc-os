import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { schema } from "@/db";
import { getBrand } from "@/lib/brand";
import { currentOrgId, withOrg } from "@/lib/org";
import { getSettings } from "@/lib/settings";

export interface PrintedBank {
  name: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
}

/**
 * The bank account customers pay into, as invoices, statements and proposals print it: the default bank account in
 * Accounts › Settings › Bank and cash accounts. Until that account has a number or IBAN, the details from the old
 * "Terms and bank details" form (settings bank_*) still print, so nothing disappears from a document. Null = none.
 */
export const printedBank = cache(async (): Promise<PrintedBank | null> => {
  const orgId = await currentOrgId();
  const b = schema.bankAccounts;
  const [[acc], s, brand] = await Promise.all([
    withOrg(orgId, (tx) =>
      tx
        .select({ bankName: b.bankName, accountNumber: b.accountNumber, iban: b.iban, swift: b.swift, holderName: b.holderName })
        .from(b)
        .where(and(eq(b.organizationId, orgId), eq(b.kind, "bank"), eq(b.isActive, true), eq(b.isDefault, true)))
        .orderBy(asc(b.id))
        .limit(1),
    ),
    getSettings(),
    getBrand(),
  ]);
  const out: PrintedBank =
    acc && (acc.accountNumber.trim() || acc.iban.trim())
      ? { name: acc.bankName, accountName: acc.holderName || s.bank_account_name || brand.company, accountNumber: acc.accountNumber, iban: acc.iban, swift: acc.swift }
      : { name: s.bank_name, accountName: s.bank_account_name, accountNumber: s.bank_account_number, iban: s.bank_iban, swift: s.bank_swift };
  return out.iban.trim() || out.accountNumber.trim() ? out : null;
});
