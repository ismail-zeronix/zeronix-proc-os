/**
 * Nomod Hosted Checkout without the network (nomod.ts sends it): the body of POST /v1/checkout for a web order.
 * Docs: https://nomod.com/docs/api-reference/create-checkout. Amounts are decimal strings in AED, VAT included (the
 * site's prices already include it), and the items add up to the order total, the delivery charge as its own item.
 */

export type NomodStatus = "created" | "paid" | "cancelled" | "expired";

export interface NomodOrder {
  number: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  items: { slug: string; mpn: string; name: string; qty: number; unitPrice: string }[];
  deliveryFee: string;
  total: string;
}

/** A UAE mobile as +9715…; anything that does not look like a full number is left out (Nomod then asks for it). */
export function nomodPhone(raw: string): string | undefined {
  let p = raw.replace(/[\s()-]/g, "");
  if (p.startsWith("00")) p = `+${p.slice(2)}`;
  else if (/^0\d{8,9}$/.test(p)) p = `+971${p.slice(1)}`;
  else if (/^5\d{8}$/.test(p)) p = `+971${p}`;
  return /^\+\d{8,15}$/.test(p) ? p : undefined;
}

const money = (v: number | string) => Number(v).toFixed(2);

export function nomodCheckoutBody(o: NomodOrder, urls: { success: string; failure: string; cancelled: string }, site = "") {
  const items = o.items.map((i) => ({
    item_id: (i.mpn || i.slug).slice(0, 100),
    name: i.name.slice(0, 200),
    quantity: i.qty,
    unit_amount: money(i.unitPrice),
    total_amount: money(Number(i.unitPrice) * i.qty),
    net_amount: money(Number(i.unitPrice) * i.qty),
  }));
  if (Number(o.deliveryFee) > 0) items.push({ item_id: "delivery", name: "Delivery", quantity: 1, unit_amount: money(o.deliveryFee), total_amount: money(o.deliveryFee), net_amount: money(o.deliveryFee) });
  const [first, ...rest] = o.name.trim().split(/\s+/);
  const phone = nomodPhone(o.phone);
  return {
    reference_id: o.number,
    amount: money(o.total),
    currency: "AED",
    items,
    customer: {
      first_name: first ?? "",
      last_name: rest.join(" "),
      email: o.email,
      ...(phone ? { phone_number: phone } : {}),
      ...(o.company ? { business_name: o.company.slice(0, 160) } : {}),
    },
    success_url: urls.success,
    failure_url: urls.failure,
    cancelled_url: urls.cancelled,
    metadata: { order: o.number, ...(site ? { site: site.slice(0, 512) } : {}) },
  };
}

/** The page the customer comes back to: the order number, a token that proves the link is ours, and Nomod's result. */
export function returnUrl(siteUrl: string, number: string, token: string, result: "success" | "failure" | "cancelled") {
  const u = new URL("/checkout/done", siteUrl);
  u.search = new URLSearchParams({ n: number, t: token, pay: "card", r: result }).toString();
  return u.toString();
}
