/**
 * "Share price": the WhatsApp text a salesperson sends a customer for the products they ticked in Procurement Search.
 * The price on each line is the one the salesperson typed: supplier names and supplier prices never go into it.
 */

export interface ShareLine {
  /** Brand, model and part number, e.g. "Dell Latitude 5450". */
  label: string;
  /** "i7 · 16GB · 512GB SSD"; empty to leave out. */
  specs: string;
  /** Our price to the customer, typed by the salesperson; null = not filled in yet. */
  price: number | null;
  /** "Ready stock", "2 weeks"...; empty to leave out. */
  stock: string;
}

export interface ShareOptions {
  showSpecs: boolean;
  showStock: boolean;
  currency: string;
  /** Closing line, e.g. "Prices in AED, excluding VAT. Subject to stock availability." */
  footer: string;
}

export const DEFAULT_SHARE_FOOTER = "Prices excluding VAT. Subject to stock availability.";

const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** WhatsApp bold breaks on a star inside the text. */
const bold = (s: string) => `*${s.replace(/\*/g, "").trim()}*`;

/** One block per product (name in bold, specs, price and stock), then the footer. */
export function shareText(lines: ShareLine[], o: ShareOptions): string {
  const blocks = lines.map((l) => {
    const rows = [bold(l.label)];
    if (o.showSpecs && l.specs.trim()) rows.push(l.specs.trim());
    const tail = [l.price != null ? `${o.currency} ${amount(l.price)}` : "", o.showStock ? l.stock.trim() : ""].filter(Boolean).join(" · ");
    if (tail) rows.push(tail);
    return rows.join("\n");
  });
  return [...blocks, o.footer.trim()].filter(Boolean).join("\n\n");
}

/** "2,200" / "2200.50" / "AED 2,200" -> 2200; null when it is not a price. */
export function parseTypedPrice(s: string): number | null {
  const t = s.replace(/[^\d.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
