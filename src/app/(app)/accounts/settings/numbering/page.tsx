import { desc } from "drizzle-orm";
import { NumberingForm } from "@/components/settings-ui";
import { db, schema } from "@/db";
import { requireAccountant } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Document numbers · Zeronix Accounts" };

export default async function NumberingPage() {
  await requireAccountant();
  const last = async (t: typeof schema.quotes | typeof schema.salesOrders | typeof schema.creditNotes | typeof schema.payments | typeof schema.bills | typeof schema.supplierPayments | typeof schema.invoices) => (await db.select({ n: t.number }).from(t).orderBy(desc(t.id)).limit(1))[0]?.n ?? null;
  const [s, inv, quote, order, credit, receipt, bill, voucher, journal, delivery] = await Promise.all([
    getSettings(),
    last(schema.invoices),
    last(schema.quotes),
    last(schema.salesOrders),
    last(schema.creditNotes),
    last(schema.payments),
    last(schema.bills),
    last(schema.supplierPayments),
    db.select({ n: schema.journalEntries.number }).from(schema.journalEntries).orderBy(desc(schema.journalEntries.id)).limit(1).then((r) => r[0]?.n ?? null),
    db.select({ n: schema.salesOrders.dnNumber }).from(schema.salesOrders).orderBy(desc(schema.salesOrders.dnYear), desc(schema.salesOrders.dnSeq)).limit(1).then((r) => r[0]?.n ?? null),
  ]);
  const year = new Date().getFullYear();
  return (
    <NumberingForm
      key={`${s.invoice_prefix}|${s.invoice_next_number}|${s.invoice_digits}`}
      initial={{ prefix: s.invoice_prefix, next: s.invoice_next_number, digits: s.invoice_digits }}
      lastIssued={inv}
      others={[
        { label: "Quote", pattern: `ZQ-${year}-0001`, last: quote },
        { label: "Sales order", pattern: `ZSO-${year}-0001`, last: order },
        { label: "Delivery note", pattern: `ZDN-${year}-0001`, last: delivery },
        { label: "Credit note", pattern: `ZCN-${year}-0001`, last: credit },
        { label: "Receipt", pattern: `ZRV-${year}-0001`, last: receipt },
        { label: "Bill or expense", pattern: `ZBL-${year}-0001`, last: bill },
        { label: "Payment voucher", pattern: `ZPV-${year}-0001`, last: voucher },
        { label: "Journal entry", pattern: `JV-${year}-0001`, last: journal },
      ]}
    />
  );
}
