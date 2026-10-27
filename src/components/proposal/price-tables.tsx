import { Fragment } from "react";
import { boqMoney, groupBoq } from "@/lib/boq";
import { splitByPercent } from "@/lib/proposal";
import { lineTotal, round2 } from "@/lib/quotation";

/**
 * The price of a project as the customer sees it, straight from the BOQ, in Zeronix's quotation style: a bordered grid
 * with SL / Description / Qty / Unit Price (AED) / Total (AED), amounts with two decimals, and Subtotal, VAT and Grand
 * Total inside the table. Optional extras are listed apart and never added to the total. Used by the editor and the
 * print page, so the two always match. Plain markup with no hooks, so it renders on the server too.
 */

export interface PriceLine {
  id: number;
  section: string;
  position: number;
  description: string;
  qty: number;
  unit: string;
  unitPriceAed: number;
  costAed: number | null;
  optional: boolean;
}

export interface PriceTotals {
  subtotal: number;
  vat: number;
  total: number;
}

export function priceTotals(lines: PriceLine[], vatPct: number): PriceTotals {
  const subtotal = boqMoney(lines).sell;
  const vat = round2((subtotal * vatPct) / 100);
  return { subtotal, vat, total: round2(subtotal + vat) };
}

/** 3610 -> "3,610.00" (the currency is in the column heading). */
export const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "Hikvision 32 Channel NVR, non-PoE, DS-7732NI-K4": the product name (up to the first comma) in bold, the details after
 * it plain. Only when the details start in lower case or with a number, so "Installation, Configuration, Testing and
 * Handover" stays one bold name.
 */
export function Described({ text }: { text: string }) {
  const i = text.indexOf(", ");
  if (i < 1 || i > 80 || !/^[a-z0-9]/.test(text.slice(i + 2))) return <span className="font-semibold">{text}</span>;
  return (
    <>
      <span className="font-semibold">{text.slice(0, i)}</span>
      {text.slice(i)}
    </>
  );
}

const cell = "border border-neutral-300 px-2.5 py-1.5 align-top";
const head = "border border-neutral-300 bg-[#e9efe9] px-2.5 py-1.5 text-left text-[12px] font-semibold";
const qtyText = (l: PriceLine) => `${l.qty}${l.unit && l.unit !== "nos" ? ` ${l.unit}` : ""}`;

export function PriceTable({
  lines,
  sections,
  vatPct,
  display,
  showOptional,
  accent = "#1f7a3f",
}: {
  lines: PriceLine[];
  sections: string[];
  vatPct: number;
  display: "items" | "sections";
  showOptional: boolean;
  accent?: string;
}) {
  const firm = lines.filter((l) => !l.optional);
  const extras = lines.filter((l) => l.optional);
  const groups = groupBoq(firm, sections).filter((g) => g.lines.length);
  // one section needs no heading row, like a plain quotation
  const showSections = groups.length > 1;
  const t = priceTotals(lines, vatPct);
  if (!lines.length) return <p className="text-sm text-neutral-500 italic">The BOQ of this project has no lines yet.</p>;
  let n = 0;
  const cols = display === "items" ? 5 : 3;

  return (
    <div className="grid gap-3 text-[12.5px] text-neutral-900">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${head} w-10 text-center`}>SL</th>
            <th className={head}>Description</th>
            {display === "items" && (
              <>
                <th className={`${head} w-16 text-center`}>Qty</th>
                <th className={`${head} w-32 text-right`}>Unit Price (AED)</th>
              </>
            )}
            <th className={`${head} w-32 text-right`}>Total (AED)</th>
          </tr>
        </thead>
        <tbody>
          {display === "items"
            ? groups.map((g) => {
                const sum = g.lines.reduce((s, l) => s + lineTotal({ qty: l.qty, unitPrice: l.unitPriceAed }), 0);
                return (
                  <Fragment key={g.section || "_"}>
                    {showSections && (
                      <tr className="break-inside-avoid break-after-avoid">
                        <td colSpan={cols - 1} className={`${cell} bg-neutral-50 font-semibold`} style={{ color: accent }}>
                          {g.section || "Other items"}
                        </td>
                        <td className={`${cell} bg-neutral-50 text-right font-semibold tabular-nums`}>{amount(round2(sum))}</td>
                      </tr>
                    )}
                    {g.lines.map((l) => (
                      <tr key={l.id} className="break-inside-avoid">
                        <td className={`${cell} text-center`}>{++n}</td>
                        <td className={cell}>
                          <Described text={l.description} />
                        </td>
                        <td className={`${cell} text-center whitespace-nowrap tabular-nums`}>{qtyText(l)}</td>
                        <td className={`${cell} text-right tabular-nums`}>{amount(l.unitPriceAed)}</td>
                        <td className={`${cell} text-right tabular-nums`}>{amount(lineTotal({ qty: l.qty, unitPrice: l.unitPriceAed }))}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })
            : groups.map((g) => (
                <tr key={g.section || "_"} className="break-inside-avoid">
                  <td className={`${cell} text-center`}>{++n}</td>
                  <td className={cell}>
                    <div className="font-semibold">{g.section || "Other items"}</div>
                    <div className="text-[11.5px] text-neutral-600">{g.lines.map((l) => `${qtyText(l)} x ${l.description}`).join("; ")}</div>
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{amount(round2(g.lines.reduce((s, l) => s + lineTotal({ qty: l.qty, unitPrice: l.unitPriceAed }), 0)))}</td>
                </tr>
              ))}
          <tr className="break-inside-avoid">
            <td colSpan={cols - 1} className={`${cell} bg-[#e9efe9] text-right font-semibold`}>
              Subtotal (excl. VAT)
            </td>
            <td className={`${cell} bg-[#e9efe9] text-right font-semibold tabular-nums`}>{amount(t.subtotal)}</td>
          </tr>
          {vatPct > 0 && (
            <tr className="break-inside-avoid">
              <td colSpan={cols - 1} className={`${cell} text-right`}>
                VAT {vatPct}%
              </td>
              <td className={`${cell} text-right tabular-nums`}>{amount(t.vat)}</td>
            </tr>
          )}
          <tr className="break-inside-avoid">
            <td colSpan={cols - 1} className={`${cell} bg-[#e9efe9] text-right font-bold`}>
              Grand Total (incl. VAT)
            </td>
            <td className={`${cell} bg-[#e9efe9] text-right font-bold tabular-nums`}>{amount(t.total)}</td>
          </tr>
        </tbody>
      </table>

      {showOptional && extras.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[12px] font-semibold" style={{ color: accent }}>
            Optional items (not included in the total)
          </div>
          <table className="w-full border-collapse">
            <tbody>
              {extras.map((l) => (
                <tr key={l.id}>
                  <td className={cell}>
                    <Described text={l.description} />
                  </td>
                  <td className={`${cell} w-16 text-center whitespace-nowrap tabular-nums`}>{qtyText(l)}</td>
                  <td className={`${cell} w-32 text-right tabular-nums`}>{amount(l.unitPriceAed)}</td>
                  <td className={`${cell} w-32 text-right tabular-nums`}>{amount(lineTotal({ qty: l.qty, unitPrice: l.unitPriceAed }))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The payment schedule: each part as a share of the total with VAT, adding up exactly to it. */
export function PaymentTable({ rows, total }: { rows: { label: string; percent: number }[]; total: number; accent?: string }) {
  const amounts = splitByPercent(total, rows.map((r) => r.percent));
  return (
    <table className="w-full border-collapse text-[12.5px] text-neutral-900">
      <thead>
        <tr>
          <th className={head}>Payment</th>
          <th className={`${head} w-20 text-center`}>Share</th>
          <th className={`${head} w-40 text-right`}>Amount incl. VAT (AED)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid">
            <td className={cell}>{r.label}</td>
            <td className={`${cell} text-center tabular-nums`}>{r.percent}%</td>
            <td className={`${cell} text-right tabular-nums`}>{amount(amounts[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
