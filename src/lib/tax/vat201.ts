/**
 * The UAE VAT 201 return, worked out from what the ledger holds per tax code. Pure, so every box is easy to test.
 *
 * Boxes as the FTA form numbers them. Checked against published guides, not the FTA's own text, so the accountant should
 * confirm them before a real filing.
 */
import { addDays } from "@/lib/quotation";
import { fromMinor, toMinor } from "@/lib/money";
import { aeVat } from "./ae-vat";

/** One group of journal lines: a tax code on an account, with its taxable amount and its balance (credit less debit). */
export interface VatLedgerRow {
  code: string;
  accountType: string;
  systemKey: string | null;
  base: number;
  credit: number;
}

export interface VatBoxRow {
  box: string;
  label: string;
  /** Net amount; null where the form has none. */
  amount: number | null;
  vat: number | null;
  strong?: boolean;
  heading?: boolean;
}

export interface Vat201 {
  emirate: string;
  rows: VatBoxRow[];
  outputStandard: number;
  outputSelfAssessed: number;
  inputStandard: number;
  inputSelfAssessed: number;
  /** Box 12: VAT due on outputs. */
  totalOutput: number;
  /** Box 13: recoverable VAT on inputs. */
  totalInput: number;
  /** Box 14: payable when positive, refundable when negative. */
  payable: number;
}

export const EMIRATE_BOXES = [
  ["abu_dhabi", "1a", "Abu Dhabi"],
  ["dubai", "1b", "Dubai"],
  ["sharjah", "1c", "Sharjah"],
  ["ajman", "1d", "Ajman"],
  ["umm_al_quwain", "1e", "Umm Al Quwain"],
  ["ras_al_khaimah", "1f", "Ras Al Khaimah"],
  ["fujairah", "1g", "Fujairah"],
] as const;

export const emirateKey = (e: string) => e.trim().toLowerCase().replace(/[\s-]+/g, "_");

export function buildVat201(rows: readonly VatLedgerRow[], emirate: string): Vat201 {
  const net = new Map<string, number>();
  const vat = new Map<string, number>();
  const add = (m: Map<string, number>, box: string, v: number) => m.set(box, (m.get(box) ?? 0) + toMinor(v));
  for (const r of rows) {
    const def = aeVat.codes.find((c) => c.code === r.code);
    if (!def) continue;
    if (r.systemKey === "vat_output") add(vat, "1", r.credit);
    else if (r.systemKey === "vat_input") add(vat, "9", -r.credit);
    else if (r.systemKey === "vat_output_rc") add(vat, r.code === "IM" ? "6" : "3", r.credit);
    else if (r.systemKey === "vat_input_rc") add(vat, "10", -r.credit);
    else for (const box of r.accountType === "income" ? def.boxes.sale : def.boxes.purchase) add(net, box, r.base);
  }
  const n = (box: string) => fromMinor(net.get(box) ?? 0);
  const v = (box: string) => fromMinor(vat.get(box) ?? 0);
  const key = emirateKey(emirate);
  const netOut = ["1", "3", "4", "5", "6"].reduce((s, b) => s + (net.get(b) ?? 0), 0);
  const vatOut = ["1", "3", "6"].reduce((s, b) => s + (vat.get(b) ?? 0), 0);
  const netIn = (net.get("9") ?? 0) + (net.get("10") ?? 0);
  const vatIn = (vat.get("9") ?? 0) + (vat.get("10") ?? 0);
  const out: VatBoxRow[] = [
    { box: "", label: "VAT on sales and all other outputs", amount: null, vat: null, heading: true },
    ...EMIRATE_BOXES.map(([k, box, label]) => ({ box, label: `Standard-rated supplies in ${label}`, amount: k === key ? n("1") : 0, vat: k === key ? v("1") : 0 })),
    { box: "2", label: "Tax refunds to tourists", amount: 0, vat: 0 },
    { box: "3", label: "Supplies subject to the reverse charge", amount: n("3"), vat: v("3") },
    { box: "4", label: "Zero-rated supplies", amount: n("4"), vat: null },
    { box: "5", label: "Exempt supplies", amount: n("5"), vat: null },
    { box: "6", label: "Goods imported into the UAE", amount: n("6"), vat: v("6") },
    { box: "7", label: "Adjustments to goods imported into the UAE", amount: 0, vat: 0 },
    { box: "8", label: "Totals", amount: fromMinor(netOut), vat: fromMinor(vatOut), strong: true },
    { box: "", label: "VAT on expenses and all other inputs", amount: null, vat: null, heading: true },
    { box: "9", label: "Standard-rated expenses", amount: n("9"), vat: v("9") },
    { box: "10", label: "Supplies subject to the reverse charge", amount: n("10"), vat: v("10") },
    { box: "11", label: "Totals", amount: fromMinor(netIn), vat: fromMinor(vatIn), strong: true },
    { box: "", label: "Net VAT due", amount: null, vat: null, heading: true },
    { box: "12", label: "Total VAT due", amount: null, vat: fromMinor(vatOut) },
    { box: "13", label: "Recoverable VAT for the period", amount: null, vat: fromMinor(vatIn) },
    { box: "14", label: vatOut - vatIn >= 0 ? "Payable VAT for the period" : "Refundable VAT for the period", amount: null, vat: fromMinor(Math.abs(vatOut - vatIn)), strong: true },
  ];
  return {
    emirate: key,
    rows: out,
    outputStandard: v("1"),
    outputSelfAssessed: fromMinor((vat.get("3") ?? 0) + (vat.get("6") ?? 0)),
    inputStandard: v("9"),
    inputSelfAssessed: v("10"),
    totalOutput: fromMinor(vatOut),
    totalInput: fromMinor(vatIn),
    payable: fromMinor(vatOut - vatIn),
  };
}

/** Whether the registered emirate is one the form has a box for: box 1 must fall under the right one. */
export const emirateKnown = (e: string) => EMIRATE_BOXES.some(([k]) => k === emirateKey(e));

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

export interface VatPeriod {
  from: string;
  to: string;
  due: string;
  label: string;
}

/** Return and payment are due within 28 days of the period's end. */
export const vatDueDate = (to: string) => addDays(to, 28);

/** The VAT period a day falls in, from the registration's period length and the month a period starts. */
export function vatPeriodOf(day: string, months: number, startMonth: number): VatPeriod {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const offset = ((m - startMonth) % months + months) % months;
  const start = m - offset;
  const from = iso(y, start, 1);
  const to = iso(y, start + months, 0);
  const label = months === 1 ? new Date(`${from}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : `${new Date(`${from}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })} to ${new Date(`${to}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`;
  return { from, to, due: vatDueDate(to), label };
}

/** The period holding `day`, then the ones before it, newest first. */
export function vatPeriods(day: string, months: number, startMonth: number, count = 8): VatPeriod[] {
  const out: VatPeriod[] = [];
  let at = day;
  for (let i = 0; i < count; i++) {
    const p = vatPeriodOf(at, months, startMonth);
    out.push(p);
    at = addDays(p.from, -1);
  }
  return out;
}
