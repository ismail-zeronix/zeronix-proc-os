import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Change against the supplier's previous quote. Always an icon plus a number, so it never relies on
 * colour alone. Lower is better for a buyer, so a drop is green and a rise is red.
 */
export function Trend({
  price,
  prevPrice,
  className,
  showPct = true,
}: {
  price: number | null;
  prevPrice: number | null;
  className?: string;
  showPct?: boolean;
}) {
  if (price == null || prevPrice == null || price === prevPrice) return null;
  const down = price < prevPrice;
  const pct = Math.round(Math.abs((price - prevPrice) / prevPrice) * 1000) / 10;
  const Icon = down ? TrendingDown : TrendingUp;
  return (
    <span
      title={`Was ${prevPrice.toLocaleString("en-US")} on their previous list`}
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        down ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
        className,
      )}
    >
      <Icon className="size-3" />
      {down ? "−" : "+"}
      {showPct ? `${pct}%` : Math.abs(price - prevPrice).toLocaleString("en-US")}
    </span>
  );
}
