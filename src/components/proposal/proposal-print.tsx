import { PrintBar } from "@/components/print-bar";

/**
 * A proposal on its own A4 pages with no menus. The cover page prints edge to edge (no margin); the other pages get
 * margins that leave room for the PDF's running header and footer. When the PDF is made, the server prints the cover
 * and the body separately (html[data-pdf=cover|body]) so the page numbers start after the cover.
 */
const CSS = `
@page{size:A4;margin:22mm 14mm 18mm}
@page:first{margin:0}
@media print{body{background:#fff!important}}
html[data-pdf=cover] [data-pdf-body]{display:none!important}
html[data-pdf=body] [data-pdf-cover]{display:none!important}
`;

export function ProposalPrintFrame({ back, label, note, pdfHref, children }: { back: string; label: string; note?: string; pdfHref?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 px-3 py-4 print:bg-white print:p-0">
      {/* data-page-css: the PDF maker swaps this for its own page rules when it prints the body */}
      <style data-page-css>{CSS}</style>
      <PrintBar dealHref={back} number={label} pdfHref={pdfHref} />
      {note && <p className="mx-auto mt-2 max-w-[794px] rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 print:hidden">{note}</p>}
      <div className="mx-auto mt-3 max-w-[794px] shadow-sm print:mt-0 print:max-w-none print:shadow-none">{children}</div>
    </div>
  );
}
