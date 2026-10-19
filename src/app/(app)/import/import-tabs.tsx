"use client";

import { ClipboardPaste, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ExcelImport, type SupplierOption } from "./excel-import";
import { ImportForm } from "./import-form";

const MODES = [
  { key: "paste", label: "Paste WhatsApp text", hint: "Market, stockists, free-zone suppliers", icon: ClipboardPaste },
  { key: "excel", label: "Excel price list", hint: "Distributors, one sheet per category", icon: FileSpreadsheet },
] as const;

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
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="How is the price list arriving?" className="grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              mode === m.key ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
          >
            <m.icon className={cn("size-5", mode === m.key ? "text-primary" : "text-muted-foreground")} />
            <span>
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {mode === "paste" ? <ImportForm suppliers={suppliers} /> : <ExcelImport suppliers={suppliers} fxUsd={fxUsd} />}
    </div>
  );
}
