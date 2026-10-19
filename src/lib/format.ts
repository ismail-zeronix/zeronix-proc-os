export function money(price: number | null | undefined, currency = "AED") {
  if (price == null) return "Price on request";
  return `${currency} ${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function ago(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days <= 0) {
    const h = Math.floor((Date.now() - d.getTime()) / 3600_000);
    return h <= 0 ? "just now" : `${h}h ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
