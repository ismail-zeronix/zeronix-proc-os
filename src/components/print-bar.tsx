"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Back link and Print button above the document; hidden when printing. */
export function PrintBar({ dealHref, number }: { dealHref: string; number: string }) {
  return (
    <div className="mx-auto flex max-w-[794px] items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={dealHref} />}>
        <ArrowLeft /> Back
      </Button>
      <span className="flex-1 truncate text-sm text-neutral-600">{number}: choose “Save as PDF” in the print window to get a file.</span>
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Print / PDF
      </Button>
    </div>
  );
}
