import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { SalesDocument } from "@/components/sales-document";
import { requireFinance } from "@/lib/auth/session";
import { methodLabel } from "@/lib/invoicing";
import { longDay } from "@/lib/quotation";
import { quoteBrand } from "@/lib/quote-view";
import { getRefund } from "@/lib/refunds-data";

export const metadata = { title: "Refund voucher" };

/** A refund of an advance: to a customer, or received back from a supplier. */
export default async function PrintRefund({ params }: PageProps<"/print/refund/[id]">) {
  await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const r = await getRefund(id);
  if (!r) notFound();
  const brand = await quoteBrand();
  const customer = r.party === "customer";
  const back = customer ? `/accounts/customers/${r.companyId}` : `/accounts/suppliers/${r.supplierId}`;
  return (
    <PrintPage back={back} number={r.number} pdfHref={`/api/documents/refund/${r.id}/pdf`}>
      <SalesDocument
        brand={brand}
        d={{
          title: customer ? "REFUND VOUCHER" : "REFUND RECEIVED",
          partyLabel: customer ? "Paid to" : "Received from",
          number: r.number,
          meta: [
            ["Date", longDay(r.refundedOn)],
            ["Advance", r.paymentNumber],
            ["Paid by", methodLabel(r.method)],
            ...(r.reference ? ([["Reference", r.reference]] as [string, string][]) : []),
          ],
          to: { name: r.who.name, lines: [r.who.address], trn: r.who.trn },
          items: [{ id: r.id, description: `Refund of advance ${r.paymentNumber}`, qty: 1, unitPrice: r.amount }],
          showPrices: true,
          noVat: true,
          vatPct: 0,
          subtotal: r.amount,
          vatAmount: 0,
          total: r.amount,
          amountInWords: true,
          notes: [`Reason: ${r.reason}`],
          stamp: r.voidedAt ? "VOID" : undefined,
          signatures: customer ? ["Paid by (Zeronix)", "Received by"] : undefined,
        }}
      />
    </PrintPage>
  );
}
