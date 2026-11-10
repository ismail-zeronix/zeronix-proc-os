import { cn } from "@/lib/utils";
import type { SiteProductSummary } from "@/lib/contract";

export type Stock = SiteProductSummary["availability"];

const LABEL: Record<Stock, string> = { in_stock: "In stock", ships_soon: "Ships in 2–5 days", on_order: "On order" };
const DOT: Record<Stock, string> = { in_stock: "bg-cta-strong", ships_soon: "bg-amber-500", on_order: "bg-muted-ink/50" };

/** schema.org Offer availability for each label. */
export const STOCK_SCHEMA: Record<Stock, string> = {
  in_stock: "https://schema.org/InStock",
  ships_soon: "https://schema.org/BackOrder",
  on_order: "https://schema.org/PreOrder",
};

/** "● In stock": a coloured dot and the words (never colour alone). */
export function StockLabel({ value, className }: { value: Stock; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-ink/80", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[value])} aria-hidden />
      {LABEL[value]}
    </span>
  );
}
