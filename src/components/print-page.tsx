import { PrintBar } from "@/components/print-bar";

/** A document on its own A4 page with no menus, so printing or "Save as PDF" gives a clean file. */
export function PrintPage({ back, number, children }: { back: string; number: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 px-3 py-4 print:bg-white print:p-0">
      <style>{"@page{size:A4;margin:12mm} @media print{body{background:#fff!important}}"}</style>
      <PrintBar dealHref={back} number={number} />
      <div className="mx-auto mt-3 max-w-[794px] shadow-sm print:mt-0 print:max-w-none print:shadow-none">{children}</div>
    </div>
  );
}
