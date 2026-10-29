import { PrintBar } from "@/components/print-bar";

/**
 * Standard A4 for every printed document: 12 mm at the sides and top, a little more at the bottom for the browser's or
 * the PDF's page numbers. Anything else in the body (the toaster) would open an extra blank page, so print shows only
 * the document.
 */
const PAGE_CSS = "@page{size:A4;margin:12mm 12mm 14mm} @media print{html,body{background:#fff!important} body>:not(.zx-print){display:none!important}}";

/** A document on its own A4 page with no menus, so printing or "Save as PDF" gives a clean file. */
export function PrintPage({ back, number, pdfHref, children }: { back: string; number: string; pdfHref?: string; children: React.ReactNode }) {
  return (
    <div className="zx-print min-h-screen bg-neutral-100 px-3 py-4 print:min-h-0 print:bg-white print:p-0">
      <style>{PAGE_CSS}</style>
      <PrintBar dealHref={back} number={number} pdfHref={pdfHref} />
      {/* on screen the sheet is at least one A4 tall (794 x 1123 px at 96 dpi) */}
      <div className="mx-auto mt-3 min-h-[1123px] max-w-[794px] bg-white shadow-sm print:mt-0 print:min-h-0 print:max-w-none print:shadow-none">{children}</div>
    </div>
  );
}
