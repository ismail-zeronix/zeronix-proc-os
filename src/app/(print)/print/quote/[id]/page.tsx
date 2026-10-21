import { notFound } from "next/navigation";
import { QuoteDocument } from "@/components/quote-document";
import { requireApp } from "@/lib/auth/session";
import { quoteBrand, toDoc } from "@/lib/quote-view";
import { getQuote } from "@/lib/quotes-data";
import { PrintBar } from "./print-bar";

export async function generateMetadata({ params }: PageProps<"/print/quote/[id]">) {
  const q = await getQuote(Number((await params).id)).catch(() => null);
  return { title: q ? `Quotation ${q.number}` : "Quotation" };
}

/** The quotation on its own page with no menus, so printing or "Save as PDF" gives a clean document. */
export default async function PrintQuote({ params }: PageProps<"/print/quote/[id]">) {
  await requireApp("sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const q = await getQuote(id);
  if (!q) notFound();
  const brand = await quoteBrand();
  return (
    <div className="min-h-screen bg-neutral-100 px-3 py-4 print:bg-white print:p-0">
      <style>{"@page{size:A4;margin:12mm} @media print{body{background:#fff!important}}"}</style>
      <PrintBar dealHref={`/sales/quotes/${q.id}`} number={q.number} />
      <div className="mx-auto mt-3 max-w-[794px] shadow-sm print:mt-0 print:max-w-none print:shadow-none">
        <QuoteDocument q={toDoc(q)} brand={brand} />
      </div>
    </div>
  );
}
