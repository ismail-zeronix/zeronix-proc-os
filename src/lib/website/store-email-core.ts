/**
 * Shop emails in the zeronixtech.com look (pure, no server code, tested in tests/website-store-email.test.ts).
 * One layout for every transaction: a green header bar with the logo, a white card, an optional code box, item table,
 * totals, facts, a green button and a small footer. Table layout and inline styles only, so Gmail, Outlook and phone
 * mail apps all show it the same; every email also has a plain-text part.
 */

const C = {
  green: "#0f9d58", // header bar (the site's cta)
  button: "#0a8443", // buttons and links (brand-900, white text passes AA)
  ink: "#1d2330",
  muted: "#666e7a",
  line: "#e5e7eb",
  page: "#f2f3f5",
  mint: "#e8f5ee",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface EmailItem {
  name: string;
  detail?: string;
  amount: string;
}
export interface EmailParts {
  /** The grey line mail apps show after the subject. */
  preheader: string;
  title: string;
  paragraphs: string[];
  /** A big code (sign-in). */
  code?: string;
  items?: EmailItem[];
  totals?: { label: string; value: string; strong?: boolean }[];
  /** Label / value rows (delivery, payment, tracking). */
  facts?: { label: string; value: string }[];
  /** A boxed note (bank details). Plain text, line breaks kept. */
  note?: { title: string; body: string };
  button?: { label: string; href: string };
  /** The small line above the footer. */
  closing?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (s: string) => esc(s).replace(/\n/g, "<br>");

export function renderStoreEmail(p: EmailParts, siteUrl: string): { html: string; text: string } {
  const site = siteUrl.replace(/\/+$/, "");
  const host = site.replace(/^https?:\/\//, "");
  const td = (style: string, inner: string) => `<td style="${style}">${inner}</td>`;
  const para = (t: string) => `<p style="margin:0 0 14px;font:15px/1.6 ${FONT};color:${C.ink}">${lines(t)}</p>`;

  const code = p.code
    ? `<div style="margin:6px 0 20px;padding:18px;border-radius:10px;background:${C.mint};text-align:center;font:700 32px/1 ${FONT};letter-spacing:8px;color:${C.ink}">${esc(p.code)}</div>`
    : "";
  const items = p.items?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px;border-top:1px solid ${C.line}">${p.items
        .map(
          (i) =>
            `<tr>${td(`padding:12px 0;border-bottom:1px solid ${C.line};font:14px/1.45 ${FONT};color:${C.ink}`, `${esc(i.name)}${i.detail ? `<br><span style="font-size:12px;color:${C.muted}">${esc(i.detail)}</span>` : ""}`)}${td(`padding:12px 0 12px 12px;border-bottom:1px solid ${C.line};font:600 14px/1.45 ${FONT};color:${C.ink};text-align:right;white-space:nowrap;vertical-align:top`, esc(i.amount))}</tr>`,
        )
        .join("")}</table>`
    : "";
  const totals = p.totals?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${p.totals
        .map((t) => {
          const s = t.strong ? `font:700 16px/1.4 ${FONT};color:${C.ink};padding-top:8px` : `font:14px/1.4 ${FONT};color:${C.muted};padding-top:6px`;
          return `<tr>${td(s, esc(t.label))}${td(`${s};text-align:right;white-space:nowrap`, esc(t.value))}</tr>`;
        })
        .join("")}</table>`
    : "";
  const facts = p.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-radius:10px;background:${C.page}">${p.facts
        .map((f) => `<tr>${td(`padding:10px 14px;font:13px/1.45 ${FONT};color:${C.muted};width:34%;vertical-align:top`, esc(f.label))}${td(`padding:10px 14px 10px 0;font:14px/1.45 ${FONT};color:${C.ink}`, lines(f.value))}</tr>`)
        .join("")}</table>`
    : "";
  const note = p.note
    ? `<div style="margin:0 0 18px;padding:14px 16px;border:1px solid ${C.line};border-left:3px solid ${C.button};border-radius:8px"><p style="margin:0 0 6px;font:600 14px/1.4 ${FONT};color:${C.ink}">${esc(p.note.title)}</p><p style="margin:0;font:14px/1.55 ${FONT};color:${C.ink}">${lines(p.note.body)}</p></div>`
    : "";
  const button = p.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="border-radius:8px;background:${C.button}"><a href="${esc(p.button.href)}" style="display:inline-block;padding:12px 22px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px">${esc(p.button.label)} &rarr;</a></td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(p.title)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(p.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:${C.green};border-radius:12px 12px 0 0;padding:18px 24px">
  <a href="${esc(site)}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle"><img src="${esc(site)}/icon-email.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px"></td>
    <td style="vertical-align:middle;padding-left:10px"><div style="font:700 20px/1 ${FONT};color:#ffffff;letter-spacing:-0.3px">Zeronix</div><div style="font:600 8px/1 ${FONT};color:#ffffff;opacity:.85;letter-spacing:3px;padding-top:4px">TECHNOLOGY</div></td>
  </tr></table></a>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px 24px 12px">
  <h1 style="margin:0 0 14px;font:700 21px/1.3 ${FONT};color:${C.ink}">${esc(p.title)}</h1>
  ${p.paragraphs.map(para).join("")}${code}${items}${totals}${facts}${note}${button}
  ${p.closing ? `<p style="margin:0 0 18px;font:14px/1.6 ${FONT};color:${C.muted}">${lines(p.closing)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 8px;text-align:center;font:12px/1.6 ${FONT};color:${C.muted}">
  Zeronix Tech · Business IT for UAE companies<br><a href="${esc(site)}" style="color:${C.button};text-decoration:none">${esc(host)}</a>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    p.title,
    "",
    ...p.paragraphs.flatMap((t) => [t, ""]),
    ...(p.code ? [p.code, ""] : []),
    ...(p.items?.length ? [...p.items.map((i) => `${i.name}${i.detail ? ` (${i.detail})` : ""}: ${i.amount}`), ""] : []),
    ...(p.totals?.length ? [...p.totals.map((t) => `${t.label}: ${t.value}`), ""] : []),
    ...(p.facts?.length ? [...p.facts.map((f) => `${f.label}: ${f.value}`), ""] : []),
    ...(p.note ? [p.note.title, p.note.body, ""] : []),
    ...(p.button ? [`${p.button.label}: ${p.button.href}`, ""] : []),
    ...(p.closing ? [p.closing, ""] : []),
    "Zeronix Tech · Business IT for UAE companies",
    host,
  ].join("\n");
  return { html, text };
}

// ---------- the shop's emails ----------

export const aedText = (v: string | number) => `AED ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What the order emails need from an order (the site_orders row, or the checkout input with its lines). */
export interface MailOrder {
  number: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  delivery: "delivery" | "pickup";
  address: { emirate: string; area: string; street: string };
  payment: "request" | "cod" | "bank" | "card";
  notes: string;
  items: { name: string; mpn: string; qty: number; unitPrice: string }[];
  deliveryFee: string;
  subtotal: string;
  vat: string;
  total: string;
  tracking?: { courier?: string; number?: string; url?: string };
}

const PAYMENT: Record<MailOrder["payment"], string> = {
  request: "Order request (we confirm, then send a payment link or invoice)",
  cod: "Cash or card on delivery",
  bank: "Bank transfer",
  card: "Paid online by card",
};

const where = (o: MailOrder) => (o.delivery === "pickup" ? "Collect from our office" : [o.address.street, o.address.area, o.address.emirate].filter(Boolean).join(", "));

function orderLines(o: MailOrder): Pick<EmailParts, "items" | "totals"> {
  return {
    items: [
      ...o.items.map((l) => ({ name: l.name, detail: `${l.qty} × ${aedText(l.unitPrice)}${l.mpn ? ` · ${l.mpn}` : ""}`, amount: aedText(Number(l.unitPrice) * l.qty) })),
      ...(o.delivery === "delivery" ? [{ name: "Delivery", amount: Number(o.deliveryFee) ? aedText(o.deliveryFee) : "Free" }] : []),
    ],
    totals: [
      { label: "Total before VAT", value: aedText(o.subtotal) },
      { label: "VAT 5%", value: aedText(o.vat) },
      { label: "Total", value: aedText(o.total), strong: true },
    ],
  };
}

export function loginCodeEmail(code: string, siteUrl: string) {
  return {
    subject: `${code} is your Zeronix Tech sign-in code`,
    ...renderStoreEmail(
      {
        preheader: "Your sign-in code works for 10 minutes.",
        title: "Your sign-in code",
        paragraphs: ["Enter this code on zeronixtech.com to sign in. It works for 10 minutes."],
        code,
        closing: "If you did not ask for this code, you can ignore this email.",
      },
      siteUrl,
    ),
  };
}

/** The customer's confirmation when the order is placed (or, for a card order, when the payment comes in). */
export function orderPlacedEmail(o: MailOrder, store: { bankDetails: string; deliveryNote: string }, siteUrl: string) {
  const paid = o.payment === "card";
  const payNote =
    o.payment === "bank" && store.bankDetails
      ? { title: `Please pay by bank transfer, with ${o.number} as the reference`, body: store.bankDetails }
      : undefined;
  const payLine = paid ? "We have received your payment. Thank you." : o.payment === "cod" ? "You pay on delivery, by cash or card." : o.payment === "request" ? "We will confirm your order and send you a payment link or invoice." : "";
  return {
    subject: paid ? `Payment received: Zeronix Tech order ${o.number}` : `Your Zeronix Tech order ${o.number}`,
    ...renderStoreEmail(
      {
        preheader: paid ? `Payment received for order ${o.number}. Total ${aedText(o.total)}.` : `We have your order ${o.number}. Total ${aedText(o.total)}.`,
        title: paid ? "Payment received, thank you" : "Thank you for your order",
        paragraphs: [`Hello ${o.name},`, `Thank you for your order ${o.number}. Here is what you ordered.${payLine ? ` ${payLine}` : ""}`],
        ...orderLines(o),
        facts: [
          { label: "Order", value: o.number },
          { label: o.delivery === "pickup" ? "Collection" : "Delivery to", value: where(o) },
          { label: "Payment", value: PAYMENT[o.payment] },
          ...(store.deliveryNote && o.delivery === "delivery" ? [{ label: "When", value: store.deliveryNote }] : []),
        ],
        note: payNote,
        button: { label: "View your orders", href: `${siteUrl.replace(/\/+$/, "")}/account` },
        closing: "Reply to this email if anything needs changing.",
      },
      siteUrl,
    ),
  };
}

/** The notice to the team (Website › Settings › Store › notify email). */
export function staffOrderEmail(o: MailOrder, siteUrl: string) {
  return {
    subject: `New web order ${o.number}: ${aedText(o.total)}${o.payment === "card" ? " (paid online)" : ""}`,
    ...renderStoreEmail(
      {
        preheader: `${o.name}${o.company ? `, ${o.company}` : ""} · ${aedText(o.total)}`,
        title: `New web order ${o.number}`,
        paragraphs: [`${o.name}${o.company ? `, ${o.company}` : ""} placed an order on the website.`],
        ...orderLines(o),
        facts: [
          { label: "Customer", value: `${o.name}${o.company ? `\n${o.company}` : ""}` },
          { label: "Contact", value: [o.email, o.phone].filter(Boolean).join("\n") },
          { label: o.delivery === "pickup" ? "Collection" : "Delivery to", value: where(o) },
          { label: "Payment", value: PAYMENT[o.payment] },
          ...(o.notes ? [{ label: "Notes", value: o.notes }] : []),
        ],
        closing: "Open Website › Orders in ZeronixOS to confirm it.",
      },
      siteUrl,
    ),
  };
}

export type MailStatus = "confirmed" | "paid" | "shipped" | "delivered" | "cancelled";
export const MAIL_STATUSES: readonly string[] = ["confirmed", "paid", "shipped", "delivered", "cancelled"];

/** The customer's update when the team (or the Sales sync) moves the order on. */
export function orderStatusEmail(o: MailOrder, status: MailStatus, store: { bankDetails: string }, siteUrl: string) {
  const pickup = o.delivery === "pickup";
  const t = o.tracking ?? {};
  const copy: Record<MailStatus, { subject: string; title: string; text: string }> = {
    confirmed: {
      subject: `Order ${o.number} is confirmed`,
      title: "Your order is confirmed",
      text: `Good news: we have checked stock and confirmed your order ${o.number}. We will let you know as soon as it ${pickup ? "is ready to collect" : "ships"}.`,
    },
    paid: { subject: `Payment received for order ${o.number}`, title: "Payment received, thank you", text: `We have received your payment for order ${o.number}.` },
    shipped: {
      subject: pickup ? `Order ${o.number} is ready to collect` : `Order ${o.number} is on its way`,
      title: pickup ? "Your order is ready to collect" : "Your order is on its way",
      text: pickup ? `Your order ${o.number} is ready. You can collect it from our office.` : `Your order ${o.number} has left our warehouse and is on its way to you.`,
    },
    delivered: {
      subject: `Order ${o.number} has been delivered`,
      title: "Your order has been delivered",
      text: `Your order ${o.number} has been delivered. Thank you for buying from Zeronix Tech. Your products carry the manufacturer's UAE warranty; reply to this email if you need help with setup or support.`,
    },
    cancelled: {
      subject: `Order ${o.number} has been cancelled`,
      title: "Your order has been cancelled",
      text: `Your order ${o.number} has been cancelled. If you did not expect this, or you already paid, reply to this email and we will sort it out.`,
    },
  };
  const c = copy[status];
  const owesBank = status === "confirmed" && o.payment === "bank" && store.bankDetails;
  const tracking =
    status === "shipped" && !pickup && (t.courier || t.number)
      ? [{ label: "Tracking", value: [t.courier, t.number].filter(Boolean).join(" · ") }]
      : [];
  return {
    subject: c.subject,
    ...renderStoreEmail(
      {
        preheader: c.text,
        title: c.title,
        paragraphs: [`Hello ${o.name},`, c.text],
        ...(status === "cancelled" ? {} : orderLines(o)),
        facts: [{ label: "Order", value: o.number }, ...tracking, ...(status === "shipped" || status === "confirmed" ? [{ label: pickup ? "Collection" : "Delivery to", value: where(o) }] : [])],
        note: owesBank ? { title: `Please pay by bank transfer, with ${o.number} as the reference`, body: store.bankDetails } : undefined,
        button: status === "shipped" && t.url ? { label: "Track your delivery", href: t.url } : { label: "View your orders", href: `${siteUrl.replace(/\/+$/, "")}/account` },
        closing: "Questions about your order? Reply to this email.",
      },
      siteUrl,
    ),
  };
}
