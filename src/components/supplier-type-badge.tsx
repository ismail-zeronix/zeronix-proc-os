import { supplierType } from "@/lib/supplier-types";
import { cn } from "@/lib/utils";

/** Small coloured label for a supplier's market category. Text always says what it is. */
export function SupplierTypeBadge({
  type,
  short = false,
  className,
}: {
  type: string;
  short?: boolean;
  className?: string;
}) {
  const t = supplierType(type);
  return (
    <span
      title={t.description}
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap",
        t.tone,
        className,
      )}
    >
      {short ? t.short : t.label}
    </span>
  );
}
