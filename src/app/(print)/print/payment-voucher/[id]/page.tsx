import { notFound } from "next/navigation";
import { VoucherDocument } from "@/components/money-documents";
import { PrintPage } from "@/components/print-page";
import { requireFinance } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/purchases";
import { getSupplierPayment } from "@/lib/purchases-data";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Payment voucher" };

/** Payment voucher: what went out, each bill it paid with what was still to pay right after, and any advance. */
export default async function PrintVoucher({ params }: PageProps<"/print/payment-voucher/[id]">) {
  await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const p = await getSupplierPayment(id);
  if (!p) notFound();
  const brand = await quoteBrand();
  return (
    <PrintPage back={p.documents.length === 1 ? `/accounts/bills/${p.documents[0].id}` : "/accounts/payments-made"} number={p.number} pdfHref={`/api/documents/payment-voucher/${p.id}/pdf`}>
      <VoucherDocument brand={brand} v={{ ...p, documents: p.documents.map((d) => ({ ...d, category: categoryLabel(d.category) })), voided: p.voidedAt ? p.voidReason || "Voided" : null }} />
    </PrintPage>
  );
}
