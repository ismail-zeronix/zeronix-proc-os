import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { SalesDocument } from "@/components/sales-document";
import { getInvoice } from "@/lib/accounts-data";
import { requireAnyApp } from "@/lib/auth/any-app";
import { canSeeDeal, viewerOf } from "@/lib/auth/visibility";
import { creditDoc, invoiceDoc } from "@/lib/doc-views";
import { quoteBrand } from "@/lib/quote-view";

export async function generateMetadata({ params, searchParams }: PageProps<"/print/invoice/[id]">) {
  const inv = await getInvoice(Number((await params).id)).catch(() => null);
  const sp = await searchParams;
  const note = sp.doc === "credit" ? (inv?.credits.find((c) => c.id === Number(sp.cn)) ?? inv?.credits.at(-1)) : null;
  return { title: inv ? (note ? `Credit note ${note.number}` : `Tax invoice ${inv.number}`) : "Invoice" };
}

/** The tax invoice, or one of its credit notes (?doc=credit&cn=id). Sales can print it for the customer; Accounts manages it. */
export default async function PrintInvoice({ params, searchParams }: PageProps<"/print/invoice/[id]">) {
  const access = await requireAnyApp("accounts", "sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const inv = await getInvoice(id);
  // an opening invoice (carried from Zoho) has no lines to print here: Zoho holds the tax invoice
  if (!inv || inv.kind === "opening") notFound();
  // Accounts sees every invoice; in Sales only the ones on your deals
  if (!access.finance && !(inv.dealId && (await canSeeDeal(viewerOf(access), inv.dealId)))) notFound();
  const sp = await searchParams;
  const wantCredit = sp.doc === "credit";
  const cn = Number(sp.cn) || undefined;
  const d = wantCredit ? creditDoc(inv, cn) : await invoiceDoc(inv);
  if (!d) notFound();
  const brand = await quoteBrand();
  const back = access.finance ? `/accounts/invoices/${inv.id}` : inv.orderId ? `/sales/orders/${inv.orderId}` : `/sales/customers/${inv.companyId}`;
  return (
    <PrintPage back={back} number={d.number} pdfHref={`/api/documents/invoice/${inv.id}/pdf${wantCredit ? `?doc=credit${cn ? `&cn=${cn}` : ""}` : ""}`}>
      <SalesDocument d={d} brand={brand} />
    </PrintPage>
  );
}
