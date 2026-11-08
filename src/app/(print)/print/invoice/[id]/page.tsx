import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { SalesDocument } from "@/components/sales-document";
import { getInvoice } from "@/lib/accounts-data";
import { requireAnyApp } from "@/lib/auth/any-app";
import { canSeeInvoice, financeViewerOf } from "@/lib/auth/visibility";
import { creditDoc, invoiceDoc } from "@/lib/doc-views";
import { brandFor } from "@/lib/seller";
import { quoteBrand } from "@/lib/quote-view";

/** The invoice, only for someone who may see it (the title must not give away another team's invoice number). */
async function visibleInvoice(id: number) {
  const access = await requireAnyApp("accounts", "sales");
  if (!Number.isInteger(id) || id < 1) return null;
  if (!(await canSeeInvoice(financeViewerOf(access), id))) return null;
  return getInvoice(id);
}

export async function generateMetadata({ params, searchParams }: PageProps<"/print/invoice/[id]">) {
  const inv = await visibleInvoice(Number((await params).id)).catch(() => null);
  const sp = await searchParams;
  const note = sp.doc === "credit" ? (inv?.credits.find((c) => c.id === Number(sp.cn)) ?? inv?.credits.at(-1)) : null;
  return { title: inv ? (note ? `Credit note ${note.number}` : `Tax invoice ${inv.number}`) : "Invoice" };
}

/** The tax invoice, or one of its credit notes (?doc=credit&cn=id). Sales can print it for the customer; Accounts manages it. */
export default async function PrintInvoice({ params, searchParams }: PageProps<"/print/invoice/[id]">) {
  const access = await requireAnyApp("accounts", "sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  // Accounts sees every invoice; in Sales the ones on your deals, your orders and your instant quotes (lib/auth/visibility.ts)
  const inv = await visibleInvoice(id);
  // an opening invoice (carried from Zoho) has no lines to print here: Zoho holds the tax invoice
  if (!inv || inv.kind === "opening") notFound();
  const sp = await searchParams;
  const wantCredit = sp.doc === "credit";
  const cn = Number(sp.cn) || undefined;
  const d = wantCredit ? creditDoc(inv, cn) : await invoiceDoc(inv);
  if (!d) notFound();
  // the name, address and TRN it was issued with (older ones: the current details)
  const brand = brandFor(await quoteBrand(), inv.sellerSnapshot);
  const back = access.finance ? `/accounts/invoices/${inv.id}` : inv.orderId ? `/sales/orders/${inv.orderId}` : `/sales/customers/${inv.companyId}`;
  return (
    <PrintPage back={back} number={d.number} pdfHref={`/api/documents/invoice/${inv.id}/pdf${wantCredit ? `?doc=credit${cn ? `&cn=${cn}` : ""}` : ""}`}>
      <SalesDocument d={d} brand={brand} />
    </PrintPage>
  );
}
