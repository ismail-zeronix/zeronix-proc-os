import { notFound } from "next/navigation";
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
  const q = await getQuote(Number((await params).id), financeViewerOf(await requireAnyApp("accounts", "projects"))).catch(() => null);
  return { title: q ? `Quotation ${q.number}` : "Quotation" };
}

/**
 * The quotation on its own page with no menus, so printing or "Save as PDF" gives a clean document. A project quote is
 * its proposal, exactly as it was frozen when the quote was made or last updated.
 */
export default async function PrintQuote({ params }: PageProps<"/print/quote/[id]">) {
  // project quotes are made and sent from the Projects app too
  const access = await requireAnyApp("accounts", "projects");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const q = await getQuote(id, financeViewerOf(access));
  if (!q) notFound();
  const [brand, snapshot] = await Promise.all([quoteBrand(), snapshotOfQuote(q.id)]);
  const back = access.apps.includes("accounts") ? `/accounts/quotes/${q.id}` : `/projects/list`;
  if (snapshot) {
    return (
      <ProposalPrintFrame back={back} label={`Proposal ${q.number}`} pdfHref={`/api/quotes/${q.id}/pdf`}>
        <ProposalDocument blocks={snapshot.blocks} cover={{ ...snapshot.cover, validUntil: snapshot.cover.validUntil ?? q.validUntil }} boq={snapshot.boq} brand={await proposalBrand()} />
      </ProposalPrintFrame>
    );
  }
  return (
    <div className="min-h-screen bg-neutral-100 px-3 py-4 print:bg-white print:p-0">
      <style>{"@page{size:A4;margin:12mm} @media print{body{background:#fff!important}}"}</style>
      <PrintBar dealHref={back} number={q.number} />
      <div className="mx-auto mt-3 max-w-[794px] shadow-sm print:mt-0 print:max-w-none print:shadow-none">
        <QuoteDocument q={toDoc(q)} brand={brand} />
      </div>
    </div>
  );
}
