import { notFound } from "next/navigation";
import { VoucherDocument } from "@/components/money-documents";
import { PrintPage } from "@/components/print-page";
import { requireFinance } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/purchases";
import { getBill, getSupplierPayment } from "@/lib/purchases-data";
import { round2 } from "@/lib/quotation";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Payment voucher" };

/** Payment voucher for money paid out. The balance shown is what was still to pay right after this payment. */
export default async function PrintVoucher({ params }: PageProps<"/print/payment-voucher/[id]">) {
  await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const p = await getSupplierPayment(id);
  if (!p) notFound();
  const [bill, brand] = await Promise.all([getBill(p.billId), quoteBrand()]);
  // payments up to and including this one, in the order they were made
  const upTo = (bill?.payments ?? []).filter((x) => !x.voidedAt && (x.paidOn < p.paidOn || (x.paidOn === p.paidOn && x.id <= p.id)));
  const balanceAfter = round2(Math.max(0, p.billTotal - upTo.reduce((s, x) => s + x.amount, 0)));
  return (
    <PrintPage back={`/accounts/bills/${p.billId}`} number={p.number}>
      <VoucherDocument brand={brand} v={{ ...p, category: categoryLabel(p.category), balanceAfter, voided: p.voidedAt ? p.voidReason || "Voided" : null }} />
    </PrintPage>
  );
}
