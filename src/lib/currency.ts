/** Pure currency helpers: safe to import from client components (no database). */

/** AED per 1 unit of the currency. Only currencies listed here are converted. */
export interface Fx {
  usd: number;
}

export const DEFAULT_FX: Fx = { usd: 3.6725 };

export const CURRENCIES = ["AED", "USD", "EUR", "GBP"] as const;

/** Price in AED, or null for a currency we have no rate for (it then only competes with itself). */
export function toAed(price: number | null, currency: string, fx: Fx): number | null {
  if (price == null) return null;
  const c = currency.toUpperCase();
  if (c === "AED") return price;
  if (c === "USD") return Math.round(price * fx.usd * 100) / 100;
  return null;
}
