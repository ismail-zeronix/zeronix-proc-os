import { notFound } from "next/navigation";
import { ReceiptDocument } from "@/components/money-documents";
import { PrintPage } from "@/components/print-page";
import { getPayment } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { brandFor } from "@/lib/seller";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Receipt" };

/** Receipt voucher: what came in, each invoice it paid with what was still owed right after, and any advance. */
export default async function PrintReceipt({ params }: PageProps<"/print/receipt/[id]">) {
  await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const p = await getPayment(id);
  if (!p) notFound();
  // the name, address and TRN it was issued with (older ones: the current details)
  const brand = brandFor(await quoteBrand(), p.sellerSnapshot);
  return (
    <PrintPage back={p.documents.length === 1 ? `/accounts/invoices/${p.documents[0].id}` : "/accounts/payments"} number={p.number} pdfHref={`/api/documents/receipt/${p.id}/pdf`}>
      <ReceiptDocument brand={brand} r={{ ...p, voided: p.voidedAt ? p.voidReason || "Voided" : null }} />
    </PrintPage>
  );
}
