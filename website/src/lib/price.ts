/** "AED 4,399" (no decimals when the price is whole), or null when there is no public price. */
export function formatPrice(price: string | null | undefined, currency = "AED"): string | null {
  const n = Number(price);
  if (price == null || price === "" || !Number.isFinite(n) || n <= 0) return null;
  const whole = Number.isInteger(n);
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
