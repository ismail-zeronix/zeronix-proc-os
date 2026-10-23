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
  const credit = (await searchParams).doc === "credit";
  return { title: inv ? (credit && inv.credit ? `Credit note ${inv.credit.number}` : `Tax invoice ${inv.number}`) : "Invoice" };
}

/** The tax invoice, or its credit note (?doc=credit). Sales can print it for the customer; Accounts manages it. */
export default async function PrintInvoice({ params, searchParams }: PageProps<"/print/invoice/[id]">) {
  const access = await requireAnyApp("sales", "accounts");
  const { apps } = access;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const inv = await getInvoice(id);
  if (!inv) notFound();
  // Accounts sees every invoice; in Sales only the ones on your deals
  if (!apps.includes("accounts") && !(await canSeeDeal(viewerOf(access), inv.dealId))) notFound();
  const wantCredit = (await searchParams).doc === "credit";
  const d = wantCredit ? creditDoc(inv) : await invoiceDoc(inv);
  if (!d) notFound();
  const brand = await quoteBrand();
  const back = apps.includes("accounts") ? `/accounts/invoices/${inv.id}` : `/sales/orders/${inv.orderId}`;
  return (
    <PrintPage back={back} number={d.number}>
      <SalesDocument d={d} brand={brand} />
    </PrintPage>
  );
}
