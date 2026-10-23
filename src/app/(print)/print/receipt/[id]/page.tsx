import { notFound } from "next/navigation";
import { ReceiptDocument } from "@/components/money-documents";
import { PrintPage } from "@/components/print-page";
import { getInvoice, getPayment } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { round2 } from "@/lib/quotation";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Receipt" };

/** Receipt voucher for one payment. The balance shown is what was still owed right after this payment. */
export default async function PrintReceipt({ params }: PageProps<"/print/receipt/[id]">) {
  await requireApp("accounts");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const p = await getPayment(id);
  if (!p) notFound();
  const [inv, brand] = await Promise.all([getInvoice(p.invoiceId), quoteBrand()]);
  // payments up to and including this one, in the order they were recorded
  const upTo = (inv?.payments ?? []).filter((x) => !x.voidedAt && (x.paidOn < p.paidOn || (x.paidOn === p.paidOn && x.id <= p.id)));
  const balanceAfter = round2(Math.max(0, p.invoiceTotal - upTo.reduce((s, x) => s + x.amount, 0)));
  return (
    <PrintPage back={`/accounts/invoices/${p.invoiceId}`} number={p.number}>
      <ReceiptDocument
        brand={brand}
        r={{ ...p, balanceAfter, voided: p.voidedAt ? p.voidReason || "Voided" : null }}
      />
    </PrintPage>
  );
}
