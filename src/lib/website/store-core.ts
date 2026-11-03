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
}

export const STORE_DEFAULTS: StoreSettings = {
  markupPercent: 0,
  payments: ["request", "cod", "bank"],
  bankDetails: "",
  deliveryNote: "Delivery across the UAE in 2–4 working days.",
  mailUserId: null,
  notifyEmail: "",
};

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
