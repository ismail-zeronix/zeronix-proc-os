"use client";

import { ClipboardPaste, FileSpreadsheet, Info } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ExcelImport, type SupplierOption } from "./excel-import";
import { ImportForm } from "./import-form";

const MODES = [
  { key: "paste", label: "WhatsApp text", hint: "Market traders, stockists, free-zone suppliers", icon: ClipboardPaste },
  { key: "excel", label: "Excel sheet", hint: "Distributors, one sheet per category", icon: FileSpreadsheet },
] as const;

const STEPS = [
  ["Paste or upload", "A WhatsApp message, a chat export, or the distributor's Excel sheet."],
  ["It is read", "Excel is read instantly by rules. WhatsApp text is read by the local AI in the background; items already checked on that supplier's earlier lists are skipped."],
  ["Review and save", "Fix anything highlighted, then save. Prices appear on Compare straight away. Nothing is saved until you do."],
];

export function ImportTabs({
  suppliers,
  fxUsd,
  initialMode,
}: {
  suppliers: SupplierOption[];
  fxUsd: number;
  initialMode: "paste" | "excel";
}) {
  const [mode, setMode] = useState(initialMode);
  const current = MODES.find((m) => m.key === mode)!;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Add price list</h1>
        <div role="tablist" aria-label="How is the price list arriving?" className="inline-flex shrink-0 rounded-lg border bg-muted/50 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors [&_svg]:size-4",
                mode === m.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <m.icon /> {m.label}
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">{current.hint}</span>
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
      {mode === "paste" ? <ImportForm suppliers={suppliers} /> : <ExcelImport suppliers={suppliers} fxUsd={fxUsd} />}
    </div>
  );
}
