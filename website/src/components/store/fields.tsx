import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

/** Form styles for cart, checkout and account: compact, large enough to tap on phones. */
export const input = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[0.9375rem] outline-none transition-colors placeholder:text-muted-ink/60 focus:border-forest-700 disabled:bg-sage-50";

export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("grid content-start gap-1.5 text-sm", className)}>
      <span className="font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-ink">{hint}</span>}
    </label>
  );
}

/** "AED 4,489.00" with fils, for totals. */
export const aed = (n: number | string) => `AED ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "AED 4,489" for unit prices (fils only when there are some). */
export const priceText = (p: string) => formatPrice(p) ?? "";

/** Totals with the 5% VAT split out of the VAT-inclusive total. */
export function Totals({ total, note }: { total: number; note?: string }) {
  const vat = total - total / 1.05;
  return (
    <dl className="grid gap-1.5 text-sm">
      <div className="flex justify-between text-muted-ink">
        <dt>Before VAT</dt>
        <dd className="tabular-nums">{aed(total - vat)}</dd>
      </div>
      <div className="flex justify-between text-muted-ink">
        <dt>VAT 5%</dt>
        <dd className="tabular-nums">{aed(vat)}</dd>
      </div>
      <div className="flex justify-between border-t border-line/70 pt-2 text-base font-bold text-ink">
        <dt>Total</dt>
        <dd className="tabular-nums">{aed(total)}</dd>
      </div>
      {note && <p className="text-xs text-muted-ink">{note}</p>}
    </dl>
  );
}
