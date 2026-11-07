import { PrintBar } from "@/components/print-bar";

/**
 * Standard A4 for every printed document: 12 mm at the sides and top, a little more at the bottom for the browser's or
 * the PDF's page numbers. Anything else in the body (the toaster) would open an extra blank page, so print shows only
 * the document.
 */
const pageCss = (landscape: boolean) => `@page{size:A4${landscape ? " landscape" : ""};margin:12mm 12mm 14mm} @media print{html,body{background:#fff!important} body>:not(.zx-print){display:none!important}}`;

/** A document on its own A4 page with no menus, so printing or "Save as PDF" gives a clean file. */
export function PrintPage({ back, number, pdfHref, landscape = false, children }: { back: string; number: string; pdfHref?: string; landscape?: boolean; children: React.ReactNode }) {
  return (
    <div className="zx-print min-h-screen bg-neutral-100 px-3 py-4 print:min-h-0 print:bg-white print:p-0">
      <style>{pageCss(landscape)}</style>
      <PrintBar dealHref={back} number={number} pdfHref={pdfHref} />
      {/* on screen the sheet is at least one A4 tall (794 x 1123 px at 96 dpi), or one A4 wide when it lies on its side */}
      <div className={`mx-auto mt-3 bg-white shadow-sm print:mt-0 print:min-h-0 print:max-w-none print:shadow-none ${landscape ? "min-h-[794px] max-w-[1123px]" : "min-h-[1123px] max-w-[794px]"}`}>{children}</div>
    </div>
  );
}
