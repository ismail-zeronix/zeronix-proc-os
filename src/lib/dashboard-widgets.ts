/**
 * The ready-made widgets of the Accounts overview, and the rules of a saved layout. No database and no React, so the
 * browser, the server and the tests share one list.
 */
export type WidgetWidth = 3 | 4 | 6 | 8 | 12;
export type WidgetGroup = "Key figures" | "Charts" | "Lists" | "Tools";

export interface WidgetDef {
  id: string;
  title: string;
  hint: string;
  group: WidgetGroup;
  /** Widths it may take, out of 12 columns. The first is its usual one. */
  widths: readonly WidgetWidth[];
  accountant?: boolean;
}

const TILE = [3, 4, 6] as const;
const PANEL = [6, 4, 8, 12] as const;
const WIDE = [8, 6, 12] as const;

export const WIDGETS: readonly WidgetDef[] = [
  { id: "cash", title: "Cash and bank", hint: "Everything in the bank and the cash boxes today", group: "Key figures", widths: TILE },
  { id: "receivable", title: "Customers owe", hint: "Open invoices today", group: "Key figures", widths: TILE },
  { id: "overdue", title: "Overdue from customers", hint: "Open invoices past their due date", group: "Key figures", widths: TILE },
  { id: "payable", title: "We owe suppliers", hint: "Unpaid bills today", group: "Key figures", widths: TILE },
  { id: "bills-due", title: "Bills due soon", hint: "Bills to pay in the next 7 days", group: "Key figures", widths: TILE },
  { id: "sales", title: "Sales", hint: "Invoiced before VAT in the period, against the period before", group: "Key figures", widths: TILE },
  { id: "profit", title: "Net profit", hint: "From the ledger, for the period", group: "Key figures", widths: TILE },
  { id: "margin", title: "Gross margin", hint: "Gross profit as a share of sales", group: "Key figures", widths: TILE },
  { id: "expenses", title: "Running costs", hint: "Expenses in the period, not counting cost of sales", group: "Key figures", widths: TILE },
  { id: "collected", title: "Money received", hint: "Receipts in the period", group: "Key figures", widths: TILE },
  { id: "paid-out", title: "Money paid out", hint: "Payment vouchers in the period", group: "Key figures", widths: TILE },
  { id: "vat", title: "VAT for the period", hint: "VAT on sales less VAT on purchases", group: "Key figures", widths: TILE },
  { id: "stock", title: "Stock value", hint: "What Inventory holds in the ledger", group: "Key figures", widths: TILE },
  { id: "advances", title: "Advances", hint: "Held for customers, and paid to suppliers", group: "Key figures", widths: TILE },

  { id: "sales-trend", title: "Sales by month", hint: "Sales before VAT, last 12 months", group: "Charts", widths: WIDE },
  { id: "profit-trend", title: "Income and costs by month", hint: "From the ledger, last 12 months", group: "Charts", widths: WIDE },
  { id: "cash-trend", title: "Money in and out by month", hint: "Receipts and vouchers, last 12 months", group: "Charts", widths: PANEL },
  { id: "ar-ageing", title: "How late customers are", hint: "What customers owe, by days past due", group: "Charts", widths: [4, 6, 8, 12] },
  { id: "ap-ageing", title: "How late we are", hint: "What we owe suppliers, by days past due", group: "Charts", widths: [4, 6, 8, 12] },
  { id: "cost-breakdown", title: "Where the money went", hint: "Running costs by category in the period", group: "Charts", widths: PANEL },
  { id: "top-customers", title: "Top customers", hint: "Biggest sales in the period", group: "Charts", widths: PANEL },
  { id: "top-suppliers", title: "Top suppliers", hint: "Biggest purchases in the period", group: "Charts", widths: PANEL },

  { id: "overdue-list", title: "Overdue invoices", hint: "The most overdue first", group: "Lists", widths: PANEL },
  { id: "bills-list", title: "Bills to pay", hint: "The most urgent first", group: "Lists", widths: PANEL },
  { id: "to-invoice", title: "Ready to invoice", hint: "Delivered sales orders with no invoice", group: "Lists", widths: PANEL },
  { id: "quotes-waiting", title: "Quotes waiting", hint: "Sent, and waiting for an answer", group: "Lists", widths: PANEL },
  { id: "no-cost", title: "Sold without a cost", hint: "Invoices in the period with no supplier bill yet", group: "Lists", widths: PANEL },
  { id: "recent-receipts", title: "Latest money in", hint: "The newest receipts", group: "Lists", widths: PANEL },
  { id: "recent-vouchers", title: "Latest money out", hint: "The newest payment vouchers", group: "Lists", widths: PANEL },

  { id: "shortcuts", title: "Shortcuts", hint: "New invoice, receipt, bill and more", group: "Tools", widths: [4, 3, 6, 12] },
  { id: "books-health", title: "Books check", hint: "Whether the ledger agrees with the documents, and the lock date", group: "Tools", widths: [6, 4, 8, 12], accountant: true },
];

export const WIDGET_GROUPS: readonly WidgetGroup[] = ["Key figures", "Charts", "Lists", "Tools"];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));
export const widgetDef = (id: string) => BY_ID.get(id);
export const widgetsFor = (accountant: boolean) => WIDGETS.filter((w) => !w.accountant || accountant);

export interface WidgetPlacement {
  id: string;
  w: WidgetWidth;
}

const place = (id: string, w?: WidgetWidth): WidgetPlacement => ({ id, w: w ?? (widgetDef(id) as WidgetDef).widths[0] });

/** What someone sees before they change anything. */
export function defaultLayout(): WidgetPlacement[] {
  return [
    place("cash"),
    place("receivable"),
    place("payable"),
    place("profit"),
    place("sales-trend"),
    place("ar-ageing"),
    place("cash-trend"),
    place("cost-breakdown"),
    place("overdue-list"),
    place("bills-list"),
    place("to-invoice"),
    place("recent-receipts"),
  ];
}

/**
 * A saved layout made safe to show: widgets that no longer exist or this person may not see drop out, each appears once,
 * and a width it does not offer goes back to its usual one. An empty layout stays empty: they removed everything.
 */
export function cleanLayout(raw: unknown, accountant: boolean): WidgetPlacement[] {
  if (!Array.isArray(raw)) return defaultLayout().filter((p) => !widgetDef(p.id)?.accountant || accountant);
  const seen = new Set<string>();
  const out: WidgetPlacement[] = [];
  for (const item of raw) {
    const id = (item as { id?: unknown })?.id;
    if (typeof id !== "string" || seen.has(id)) continue;
    const def = widgetDef(id);
    if (!def || (def.accountant && !accountant)) continue;
    seen.add(id);
    const w = (item as { w?: unknown }).w;
    out.push({ id, w: def.widths.includes(w as WidgetWidth) ? (w as WidgetWidth) : def.widths[0] });
  }
  return out;
}
