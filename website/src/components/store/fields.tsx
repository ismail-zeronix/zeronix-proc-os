import { Lock, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

/** Form styles for cart, checkout and account: compact, large enough to tap on phones. */
export const input = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[0.9375rem] outline-none transition-colors placeholder:text-muted-ink/60 focus:border-brand-700 disabled:bg-surface-soft";

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

/**
 * Totals with the 5% VAT split out of the VAT-inclusive total. `delivery`: a charge (0 = free), "pickup" (no line), or
 * undefined while it is not known yet ("Worked out at checkout").
 */
export function Totals({ goods, delivery, note }: { goods: number; delivery?: number | "pickup"; note?: string }) {
  const total = goods + (typeof delivery === "number" ? delivery : 0);
  const vat = total - total / 1.05;
  return (
    <dl className="grid gap-1.5 text-sm">
      <div className="flex justify-between text-ink">
        <dt>Items</dt>
        <dd className="tabular-nums">{aed(goods)}</dd>
      </div>
      {delivery !== "pickup" && (
        <div className="flex justify-between text-ink">
          <dt>Delivery</dt>
          <dd className={cn("tabular-nums", delivery === 0 && "font-semibold text-brand-700")}>{delivery === undefined ? <span className="text-muted-ink">At checkout</span> : delivery === 0 ? "Free" : aed(delivery)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-line/70 pt-2 text-base font-bold text-ink">
        <dt>Total</dt>
        <dd className="tabular-nums">{aed(total)}</dd>
      </div>
      <div className="flex justify-between text-xs text-muted-ink">
        <dt>Includes VAT 5%</dt>
        <dd className="tabular-nums">{aed(vat)}</dd>
      </div>
      {note && <p className="text-xs text-muted-ink">{note}</p>}
    </dl>
  );
}

/** "Add AED 140 more for free delivery" with a bar; a tick once the cart is there. */
export function FreeDeliveryBar({ left, threshold }: { left: number; threshold: number }) {
  const done = left <= 0;
  return (
    <div className="grid gap-1.5 rounded-xl bg-surface-soft p-3">
      <p className="flex items-center gap-1.5 text-xs text-ink">
        <Truck className="size-4 shrink-0 text-brand-700" strokeWidth={1.75} />
        {done ? (
          <span className="font-semibold">Your order delivers free</span>
        ) : (
          <span>
            Add <span className="font-semibold tabular-nums">{aed(left)}</span> more for free delivery
          </span>
        )}
      </p>
      <span className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className="block h-full rounded-full bg-cta transition-[width] duration-500" style={{ width: `${Math.min(100, Math.round(((threshold - left) / threshold) * 100))}%` }} />
      </span>
    </div>
  );
}

const TRUST = [
  { icon: ShieldCheck, text: "Official UAE warranty on every product" },
  { icon: ReceiptText, text: "VAT tax invoice in your company name" },
  { icon: Lock, text: "Nothing is charged now: you pay once we confirm your order" },
];

/** The reassurance under the order summary. */
export function TrustNotes() {
  return (
    <ul className="grid gap-2 border-t border-line/70 pt-3">
      {TRUST.map((t) => (
        <li key={t.text} className="flex items-start gap-2 text-xs text-muted-ink">
          <t.icon className="mt-px size-4 shrink-0 text-brand-700" strokeWidth={1.75} />
          {t.text}
        </li>
      ))}
    </ul>
  );
}
