import { amt, cell, DocFooter, DocHeader, DocSheet, Label, LinesTable, MetaStrip, NumberedList, Parties, Party, type QuoteBrand, rowClass, safeColor, TotalsBlock, zebra } from "@/components/doc-parts";
import { lineTotal, round2 } from "@/lib/quotation";
import { aedInWords } from "@/lib/words";

export interface BankDetails {
  name: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
}

export interface SalesDocData {
  /** "TAX INVOICE", "PROFORMA INVOICE", "DELIVERY NOTE", "TAX CREDIT NOTE" */
  title: string;
  number: string;
  /** Label / value pairs under the number: dates, PO, terms... */
  meta: [string, string][];
  to: { name: string; lines: string[]; trn?: string };
  /** Second address block, e.g. "Deliver to". */
  shipTo?: { label: string; lines: string[] };
  items: { id: number; description: string; qty: number; unitPrice: number }[];
  /** Delivery notes show quantities only. */
  showPrices: boolean;
  /** Tax invoices and credit notes show the VAT rate and amount on every line. */
  vatPerLine?: boolean;
  vatPct: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  /** Printed under the totals in words. */
  amountInWords?: boolean;
  notes?: string[];
  bank?: BankDetails | null;
  /** Signature boxes at the bottom (delivery note). */
  signatures?: [string, string];
  /** Big diagonal word over the page, e.g. CANCELLED. */
  stamp?: string;
  preparedBy?: string;
}

/**
 * The paper documents after a quote: proforma, delivery note, tax invoice, credit note. Never any cost or margin.
 * Same parts and layout as the quotation (see doc-parts).
 */
export function SalesDocument({ d, brand }: { d: SalesDocData; brand: QuoteBrand }) {
  const accent = safeColor(brand.color);
  const bank = d.bank && (d.bank.iban || d.bank.accountNumber) ? d.bank : null;
  const head = [
    { label: "#", className: "w-9" },
    { label: "Item & description" },
    { label: "Qty", className: d.showPrices ? "w-12 text-right" : "w-20 text-right" },
    ...(d.showPrices ? [{ label: "Rate (AED)", className: "w-22 text-right" }, { label: d.vatPerLine ? "Taxable (AED)" : "Amount (AED)", className: "w-26 text-right" }] : []),
    ...(d.showPrices && d.vatPerLine ? [{ label: "VAT %", className: "w-14 text-right" }, { label: "VAT (AED)", className: "w-22 text-right" }] : []),
  ];
  const notes = d.notes && d.notes.length > 0 ? <NumberedList label="Notes" items={d.notes} accent={accent} /> : null;
  const bankBox = bank && (
    <div className="rounded-lg border border-neutral-200 px-3.5 py-2.5 break-inside-avoid">
      <Label>Payment by bank transfer</Label>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px] text-neutral-600">
        {(
          [
            ["Account name", bank.accountName],
            ["Bank", bank.name],
            ["Account no.", bank.accountNumber],
            ["IBAN", bank.iban],
            ["SWIFT", bank.swift],
          ] as const
        )
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}</dt>
              <dd className="font-semibold text-neutral-900 tabular-nums">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
  return (
    <DocSheet label={`${d.title} ${d.number}`} stamp={d.stamp}>
      <DocHeader brand={brand} title={d.title} number={d.number} />

      <MetaStrip items={d.meta} />

      <Parties count={d.shipTo ? 2 : 1}>
        <Party primary accent={accent} label={d.title.includes("DELIVERY") ? "Customer" : "Bill to"} name={d.to.name} lines={[...d.to.lines, d.to.trn ? `TRN: ${d.to.trn}` : ""]} />
        {d.shipTo && <Party accent={accent} label={d.shipTo.label} lines={d.shipTo.lines} />}
      </Parties>

      <LinesTable accent={accent} head={head}>
        {d.items.map((i, n) => {
          const amount = lineTotal(i);
          return (
            <tr key={i.id} className={rowClass} style={zebra(n)}>
              <td className={`${cell} text-neutral-400 tabular-nums`}>{String(n + 1).padStart(2, "0")}</td>
              <td className={`${cell} whitespace-pre-line text-neutral-900`}>{i.description}</td>
              <td className={`${cell} text-right whitespace-nowrap tabular-nums`}>{i.qty}</td>
              {d.showPrices && <td className={`${cell} text-right tabular-nums`}>{amt(i.unitPrice)}</td>}
              {d.showPrices && <td className={`${cell} text-right font-semibold text-neutral-900 tabular-nums`}>{amt(amount)}</td>}
              {d.showPrices && d.vatPerLine && <td className={`${cell} text-right tabular-nums`}>{d.vatPct}%</td>}
              {d.showPrices && d.vatPerLine && <td className={`${cell} text-right tabular-nums`}>{amt(round2((amount * d.vatPct) / 100))}</td>}
            </tr>
          );
        })}
        {!d.items.length && (
          <tr>
            <td colSpan={head.length} className={`${cell} text-neutral-500`}>
              No lines.
            </td>
          </tr>
        )}
      </LinesTable>

      {d.showPrices && (
        <TotalsBlock
          accent={accent}
          words={d.amountInWords ? aedInWords(d.total) : undefined}
          total={amt(d.total)}
          rows={[
            ["Total excluding VAT", amt(d.subtotal)],
            [d.vatPct > 0 ? `VAT (${d.vatPct}%)` : "VAT 0% (zero-rated)", amt(d.vatAmount)],
          ]}
        >
          {/* notes and bank details sit beside the totals, where the customer looks when paying */}
          {notes}
          {bankBox && <div className="max-w-80">{bankBox}</div>}
        </TotalsBlock>
      )}

      {/* a delivery note has no totals: its notes stand on their own */}
      {!d.showPrices && notes && <section className="mt-5">{notes}</section>}

      {d.signatures && (
        <section className="mt-10 grid grid-cols-2 gap-10 text-[10.5px] text-neutral-600 break-inside-avoid">
          {d.signatures.map((s) => (
            <div key={s}>
              <div className="h-12 border-b border-neutral-400" />
              <div className="mt-1 font-semibold text-neutral-800">{s}</div>
              <div className="mt-1 text-neutral-400">Name, date and company stamp</div>
            </div>
          ))}
        </section>
      )}

      <DocFooter
        brand={brand}
        left={
          <>
            {d.preparedBy && (
              <>
                Prepared by <strong className="text-neutral-700">{d.preparedBy}</strong> ·{" "}
              </>
            )}
            This is a computer-generated document.
          </>
        }
      />
    </DocSheet>
  );
}
