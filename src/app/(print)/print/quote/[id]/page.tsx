import { notFound } from "next/navigation";
import { CompanyProfile } from "@/components/company-profile";
import { ProposalDocument } from "@/components/proposal/proposal-document";
import { ProposalPrintFrame } from "@/components/proposal/proposal-print";
import { QuoteDocument } from "@/components/quote-document";
import { requireAnyApp } from "@/lib/auth/any-app";
import { financeViewerOf } from "@/lib/auth/visibility";
import { snapshotOfQuote } from "@/lib/proposals-data";
import { proposalBrand, quoteBrand, toDoc } from "@/lib/quote-view";
import { getQuote } from "@/lib/quotes-data";
import { PrintBar } from "@/components/print-bar";

export async function generateMetadata({ params }: PageProps<"/print/quote/[id]">) {
  const q = await getQuote(Number((await params).id), financeViewerOf(await requireAnyApp("sales", "projects"))).catch(() => null);
  return { title: q ? `Quotation ${q.number}` : "Quotation" };
}

/**
 * The quotation on its own page with no menus, so printing or "Save as PDF" gives a clean document. A project quote is
 * its proposal, exactly as it was frozen when the quote was made or last updated.
 */
export default async function PrintQuote({ params }: PageProps<"/print/quote/[id]">) {
  // project quotes are made and sent from the Projects app too
  const access = await requireAnyApp("sales", "projects");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const q = await getQuote(id, financeViewerOf(access));
  if (!q) notFound();
  const [brand, snapshot] = await Promise.all([quoteBrand(), snapshotOfQuote(q.id)]);
  const back = access.apps.includes("sales") ? `/sales/quotes/${q.id}` : `/projects/list`;
  if (snapshot) {
    return (
      <ProposalPrintFrame back={back} label={`Proposal ${q.number}`} pdfHref={`/api/quotes/${q.id}/pdf`}>
        <ProposalDocument blocks={snapshot.blocks} cover={{ ...snapshot.cover, validUntil: snapshot.cover.validUntil ?? q.validUntil }} boq={snapshot.boq} brand={await proposalBrand()} />
      </ProposalPrintFrame>
    );
  }
  return (
    <div className="zx-print min-h-screen bg-neutral-100 px-3 py-4 print:min-h-0 print:bg-white print:p-0">
      {/* slim margins for the quotation; the company profile is a named page with none, so its pattern runs to the edge.
          Anything printed after it (the toaster) would open a blank default page, so print shows only the document. */}
      <style>{"@page{size:A4;margin:9mm 10mm} @page profile{size:A4;margin:0} .zx-profile{page:profile;break-before:page} @media print{body{background:#fff!important} body>:not(.zx-print){display:none!important}}"}</style>
      <PrintBar dealHref={back} number={q.number} />
      <div className="mx-auto mt-3 grid max-w-[794px] gap-4 print:mt-0 print:block print:max-w-none">
        <div className="min-h-[1122px] bg-white shadow-sm print:min-h-0 print:shadow-none">
          <QuoteDocument q={toDoc(q)} brand={brand} />
        </div>
        <div className="shadow-sm print:shadow-none">
          <CompanyProfile brand={brand} />
        </div>
      </div>
    </div>
  );
}
