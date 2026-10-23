"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { canGoBack, useGoBack } from "@/components/back-button";
import { Button } from "@/components/ui/button";

/** Back and Print buttons above the document; hidden when printing. */
export function PrintBar({ dealHref, number, pdfHref }: { dealHref: string; number: string; pdfHref?: string }) {
  // dealHref: where Back goes when there is nothing to return to
  const router = useRouter();
  const goBack = useGoBack(dealHref);
  const back = () => {
    if (canGoBack()) return goBack();
    // print pages open in their own tab: close it so the user is back on the tab they came from
    window.close();
    setTimeout(() => router.push(dealHref), 150); // only runs when the browser would not close the tab
  };
  return (
    <div className="mx-auto flex max-w-[794px] items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={back}>
        <ArrowLeft /> Back
      </Button>
      {pdfHref ? (
        <>
          {/* the server-made PDF has the running header, page numbers and a full-page cover */}
          <span className="flex-1 truncate text-sm text-neutral-600">{number}</span>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button size="sm" nativeButton={false} render={<a href={pdfHref} />}>
            <Download /> Download PDF
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-sm text-neutral-600">{number}: choose “Save as PDF” in the print window to get a file.</span>
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </Button>
        </>
      )}
    </div>
  );
}
