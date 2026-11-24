"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExcelImport, type SupplierOption } from "./excel-import";

const STEPS = [
  ["Upload", "The distributor's Excel sheet. WhatsApp messages come in through Claude (Search page, 'How stock comes in')."],
  ["It is read", "Rules read the sheet straight away: part numbers, descriptions, prices and stock."],
  ["Check and save", "Fix anything highlighted, then save. Prices show in Search straight away. Nothing is saved until you do."],
];

/** The Excel upload (WhatsApp stock arrives through Claude instead: lib/procurement/intake.ts). */
export function ImportTabs({ suppliers, fxUsd }: { suppliers: SupplierOption[]; fxUsd: number }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Upload Excel price list</h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">Distributors, one sheet per category</span>
        <Popover>
          <PopoverTrigger className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="How it works">
            <Info className="size-4" /> How it works
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 gap-2 p-3">
            <ol className="grid gap-2.5">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </PopoverContent>
        </Popover>
      </div>
      <ExcelImport suppliers={suppliers} fxUsd={fxUsd} />
    </div>
  );
}
