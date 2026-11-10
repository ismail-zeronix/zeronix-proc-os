import { z } from "zod";

/**
 * The shop's rules without a database (S.3): markup and rounding, order totals and VAT, the checkout form. Prices on the
 * site include 5% VAT, so totals split the VAT out of them rather than adding it.
 */

export const VAT_RATE = 0.05;

export const PAYMENT_METHODS = ["request", "cod", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  request: "Order request: we confirm and send a payment link or invoice",
  cod: "Cash or card on delivery",
  bank: "Bank transfer",
};

export const ORDER_STATUSES = ["new", "confirmed", "paid", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_LABEL: Record<OrderStatus, string> = { new: "New", confirmed: "Confirmed", paid: "Paid", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };

export const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"] as const;

export interface StoreSettings {
  /** Added to a listing's price on import, in percent. */
  markupPercent: number;
  payments: PaymentMethod[];
  bankDetails: string;
  deliveryNote: string;
  /** ZeronixOS users.id whose connected Mail mailbox sends store emails (sign-in codes, order confirmations). */
  mailUserId: number | null;
  /** Where new-order notices go. */
  notifyEmail: string;
  delivery: DeliveryRules;
  /** ZeronixOS users.id suggested as the salesperson when a web order becomes a Sales order. */
  webOrderOwnerId: number | null;
  /** Days a customer has to return an item (as on the Delivery and warranty page); 0 = not stated, so no return policy is published. */
  returnDays: number;
}

/** Delivery charge, AED incl. VAT. Collecting from the office is always free. */
export interface DeliveryRules {
  /** The charge when no emirate fee applies; 0 = free delivery. */
  fee: number;
  /** Orders at or above this (incl. VAT) deliver free; 0 = no free-delivery amount. */
  freeAbove: number;
  /** A different charge for some emirates (e.g. further away); left out = the normal fee. */
  emirateFees: Partial<Record<string, number>>;
}

export const DELIVERY_DEFAULTS: DeliveryRules = { fee: 0, freeAbove: 0, emirateFees: {} };

export const STORE_DEFAULTS: StoreSettings = {
  markupPercent: 0,
  payments: ["request", "cod", "bank"],
  bankDetails: "",
  deliveryNote: "Delivery across the UAE in 2–4 working days.",
  mailUserId: null,
  notifyEmail: "",
  delivery: DELIVERY_DEFAULTS,
  webOrderOwnerId: null,
  returnDays: 0,
};

/** The delivery charge for an order, "25.00" (incl. VAT). `goods` is the cart total incl. VAT. */
export function deliveryFee(rules: DeliveryRules | undefined, goods: number | string, delivery: "delivery" | "pickup", emirate = ""): string {
  const r = { ...DELIVERY_DEFAULTS, ...rules };
  if (delivery === "pickup") return "0.00";
  if (r.freeAbove > 0 && Number(goods) >= r.freeAbove) return "0.00";
  const own = r.emirateFees?.[emirate];
  const fee = typeof own === "number" && own >= 0 ? own : r.fee;
  return Math.max(0, fee).toFixed(2);
}

/** A quote line as Sales takes it: price per unit before VAT. */
export interface SalesLine {
  description: string;
  qty: number;
  unitPriceAed: number;
}

/**
 * A web order (prices with 5% VAT) as Sales quote lines (prices before VAT, VAT added on the subtotal by the quote's own
 * rule, lib/quotation.ts totals). Each unit price is the VAT-inclusive price / 1.05 to the fils; the delivery charge is
 * its own line. Rounding can leave the Sales total a few fils off the web total, so a line with quantity 1 (delivery
 * first) is nudged by a few fils until both totals agree. `diff` is what is still off (0 in all but odd cases).
 */
export function salesLinesForWebOrder(
  items: Pick<OrderLine, "name" | "mpn" | "qty" | "unitPrice">[],
  deliveryFee: string | number,
  webTotal: string | number,
  totalOf: (lines: { qty: number; unitPrice: number }[]) => number,
): { lines: SalesLine[]; total: number; diff: number } {
  const net = (incl: string | number) => Math.round((Number(incl) * 100) / (1 + VAT_RATE)) / 100;
  const lines: SalesLine[] = items.map((i) => ({ description: i.mpn ? `${i.name} (part no. ${i.mpn})` : i.name, qty: i.qty, unitPriceAed: net(i.unitPrice) }));
  if (Number(deliveryFee) > 0) lines.push({ description: "Delivery", qty: 1, unitPriceAed: net(deliveryFee) });
  const target = Math.round(Number(webTotal) * 100);
  const sum = () => Math.round(totalOf(lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPriceAed }))) * 100);
  // VAT on the subtotal moves the total in steps of 1.05 fils, so a few web totals cannot be hit exactly: then the
  // closest one is kept (1 fils off at most)
  const adjustable = [...lines].reverse().find((l) => l.qty === 1);
  if (adjustable && sum() !== target) {
    const base = Math.round(adjustable.unitPriceAed * 100);
    let best = { fils: base, off: Math.abs(sum() - target) };
    for (const step of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      adjustable.unitPriceAed = (base + step) / 100;
      const off = Math.abs(sum() - target);
      if (off < best.off) best = { fils: base + step, off };
      if (off === 0) break;
    }
    adjustable.unitPriceAed = best.fils / 100;
  }
  const total = sum() / 100;
  return { lines, total, diff: Math.round((Number(webTotal) - total) * 100) / 100 };
}

/** Stock label of a product on the site. */
export const AVAILABILITY = ["in_stock", "ships_soon", "on_order"] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const AVAILABILITY_LABEL: Record<Availability, string> = { in_stock: "In stock", ships_soon: "Ships in 2–5 days", on_order: "On order" };

/**
 * A listing price plus the markup, rounded up to the next price ending in 9: 4,149 + 8% = 4,480.92 → 4,489.
 * Returns "4489.00" (two decimals, as list_price is stored).
 */
export function markedUp(price: string | number, percent: number): string {
  const raw = Number(price) * (1 + Math.max(0, percent) / 100);
  const whole = Math.ceil(Math.round(raw * 100) / 100);
  return (whole + ((9 - (whole % 10) + 10) % 10)).toFixed(2);
}

export interface OrderLine {
  productId: number;
  slug: string;
  name: string;
  mpn: string;
  qty: number;
  /** AED with VAT, per unit. */
  unitPrice: string;
}

/** Total with VAT, the VAT inside it and the amount before VAT, all as "1234.56". */
export function orderTotals(lines: Pick<OrderLine, "qty" | "unitPrice">[]): { subtotal: string; vat: string; total: string } {
  const totalFils = lines.reduce((s, l) => s + Math.round(Number(l.unitPrice) * 100) * l.qty, 0);
  const vatFils = Math.round(totalFils - totalFils / (1 + VAT_RATE));
  return { subtotal: ((totalFils - vatFils) / 100).toFixed(2), vat: (vatFils / 100).toFixed(2), total: (totalFils / 100).toFixed(2) };
}

const text = (max: number) => z.string().trim().max(max);

export const addressSchema = z.object({
  emirate: z.union([z.enum(EMIRATES), z.literal("")]),
  area: text(120),
  street: text(200),
});
export type SiteAddress = z.infer<typeof addressSchema>;

export const checkoutSchema = z
  .object({
    items: z.array(z.object({ slug: text(120).min(1), qty: z.number().int().min(1).max(100) })).min(1, "Your cart is empty").max(30),
    name: text(120).min(2, "Please enter your name"),
    email: z.email("Please enter a valid email address").max(200),
    phone: text(40).refine((v) => /^[+\d][\d\s()-]{6,}$/.test(v), "Please enter a phone number we can call"),
    company: text(160),
    trn: text(20).refine((v) => !v || /^\d{15}$/.test(v.replace(/\s/g, "")), "A UAE TRN has 15 digits"),
    delivery: z.enum(["delivery", "pickup"]),
    address: addressSchema,
    payment: z.enum(PAYMENT_METHODS),
    notes: text(1000),
  })
  .refine((v) => v.delivery === "pickup" || (v.address.emirate && v.address.area && v.address.street), { message: "Please fill in the delivery address", path: ["address"] });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** "WEB-00012". */
export const orderNumber = (id: number) => `WEB-${String(id).padStart(5, "0")}`;

export const profileSchema = z.object({
  name: text(120),
  phone: text(40).refine((v) => !v || /^[+\d][\d\s()-]{6,}$/.test(v), "Please enter a valid phone number"),
  company: text(160),
  trn: text(20).refine((v) => !v || /^\d{15}$/.test(v.replace(/\s/g, "")), "A UAE TRN has 15 digits"),
  address: addressSchema,
});
