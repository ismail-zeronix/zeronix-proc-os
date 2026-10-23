import type { QuoteBrand } from "@/components/quote-document";
import { lineTotal, money, round2 } from "@/lib/quotation";
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

const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#2a78d6");

/**
 * The paper documents after a quote: proforma, delivery note, tax invoice, credit note. Fixed light colours (it is paper,
 * also in dark mode) and never any cost or margin. Same header and layout as the quotation.
 */
export function SalesDocument({ d, brand }: { d: SalesDocData; brand: QuoteBrand }) {
  const accent = safeColor(brand.color);
  const cols = d.showPrices ? (d.vatPerLine ? 7 : 5) : 3;
  const bank = d.bank && (d.bank.iban || d.bank.accountNumber) ? d.bank : null;
  return (
    <article className="relative bg-white p-6 text-[13px] leading-relaxed text-neutral-800 sm:p-10" aria-label={`${d.title} ${d.number}`}>
      {d.stamp && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden>
          <span className="-rotate-30 rounded-xl border-8 border-red-600/30 px-8 py-2 text-7xl font-black tracking-widest text-red-600/25">{d.stamp}</span>
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div>
          {brand.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoSrc} alt={brand.company} className="max-h-14 max-w-56 object-contain" />
          ) : (
            <div className="text-2xl font-bold tracking-tight text-neutral-900">{brand.company}</div>
          )}
          {brand.tagline && <div className="mt-1 text-xs text-neutral-500">{brand.tagline}</div>}
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tracking-wide text-neutral-900">{d.title}</div>
          <div className="font-mono text-sm font-medium">{d.number}</div>
          <dl className="mt-1 grid grid-cols-[auto_auto] justify-end gap-x-2 text-xs text-neutral-600">
            {d.meta.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}:</dt>
                <dd className="text-left font-medium text-neutral-800">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <section className={`mt-4 grid gap-4 ${d.shipTo ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">From</div>
          <div className="font-semibold">{brand.company}</div>
          {brand.address && <div className="whitespace-pre-line">{brand.address}</div>}
          {brand.mainPhone && <div>Tel: {brand.mainPhone}</div>}
          {brand.trn && <div className="font-medium">TRN: {brand.trn}</div>}
        </div>
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">{d.title.includes("DELIVERY") ? "Customer" : "Bill to"}</div>
          <div className="font-semibold">{d.to.name}</div>
          {d.to.lines.filter(Boolean).map((l, i) => (
            <div key={i} className="whitespace-pre-line">
              {l}
            </div>
          ))}
          {d.to.trn ? <div className="font-medium">TRN: {d.to.trn}</div> : null}
        </div>
        {d.shipTo && (
          <div>
            <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">{d.shipTo.label}</div>
            {d.shipTo.lines.filter(Boolean).map((l, i) => (
              <div key={i} className="whitespace-pre-line">
                {l}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 bg-neutral-100 text-left text-[11px] tracking-wider text-neutral-700 uppercase" style={{ borderColor: accent }}>
              <th className="w-8 px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="w-14 px-2 py-1.5 text-right font-medium">Qty</th>
              {d.showPrices && <th className="w-24 px-2 py-1.5 text-right font-medium">Unit price</th>}
              {d.showPrices && <th className="w-24 px-2 py-1.5 text-right font-medium">{d.vatPerLine ? "Taxable amount" : "Amount"}</th>}
              {d.showPrices && d.vatPerLine && <th className="w-14 px-2 py-1.5 text-right font-medium">VAT %</th>}
              {d.showPrices && d.vatPerLine && <th className="w-24 px-2 py-1.5 text-right font-medium">VAT</th>}
            </tr>
          </thead>
          <tbody>
            {d.items.map((i, n) => {
              const amount = lineTotal(i);
              return (
                <tr key={i.id} className="border-b border-neutral-200 align-top">
                  <td className="px-2 py-2 text-neutral-500">{n + 1}</td>
                  <td className="px-2 py-2">{i.description}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{i.qty}</td>
                  {d.showPrices && <td className="px-2 py-2 text-right tabular-nums">{money(i.unitPrice)}</td>}
                  {d.showPrices && <td className="px-2 py-2 text-right tabular-nums">{money(amount)}</td>}
                  {d.showPrices && d.vatPerLine && <td className="px-2 py-2 text-right tabular-nums">{d.vatPct}%</td>}
                  {d.showPrices && d.vatPerLine && <td className="px-2 py-2 text-right tabular-nums">{money(round2((amount * d.vatPct) / 100))}</td>}
                </tr>
              );
            })}
            {!d.items.length && (
              <tr>
                <td colSpan={cols} className="px-2 py-3 text-neutral-500">
                  No lines.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {d.showPrices && (
        <div className="mt-3 ml-auto grid w-full max-w-72 gap-1 text-[13px]">
          <div className="flex justify-between">
            <span className="text-neutral-600">Total excluding VAT</span>
            <span className="tabular-nums">{money(d.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600">VAT {d.vatPct}%</span>
            <span className="tabular-nums">{money(d.vatAmount)}</span>
          </div>
          <div className="flex justify-between border-t-2 pt-1.5 text-base font-semibold" style={{ borderColor: accent }}>
            <span>Total (AED)</span>
            <span className="tabular-nums">{money(d.total)}</span>
          </div>
        </div>
      )}
      {d.showPrices && d.amountInWords && <p className="mt-2 text-right text-xs text-neutral-600 italic">{aedInWords(d.total)}</p>}

      {(d.notes?.length || bank) && (
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {d.notes && d.notes.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Notes</div>
              <ul className="mt-1 list-disc pl-5 text-xs text-neutral-700">
                {d.notes.map((t, n) => (
                  <li key={n}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {bank && (
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Payment by bank transfer</div>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                {bank.accountName && (
                  <>
                    <dt className="text-neutral-500">Account name</dt>
                    <dd>{bank.accountName}</dd>
                  </>
                )}
                {bank.name && (
                  <>
                    <dt className="text-neutral-500">Bank</dt>
                    <dd>{bank.name}</dd>
                  </>
                )}
                {bank.accountNumber && (
                  <>
                    <dt className="text-neutral-500">Account no.</dt>
                    <dd className="font-mono">{bank.accountNumber}</dd>
                  </>
                )}
                {bank.iban && (
                  <>
                    <dt className="text-neutral-500">IBAN</dt>
                    <dd className="font-mono">{bank.iban}</dd>
                  </>
                )}
                {bank.swift && (
                  <>
                    <dt className="text-neutral-500">SWIFT</dt>
                    <dd className="font-mono">{bank.swift}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </section>
      )}

      {d.signatures && (
        <section className="mt-12 grid grid-cols-2 gap-10 text-xs text-neutral-600">
          {d.signatures.map((s) => (
            <div key={s}>
              <div className="h-12 border-b border-neutral-400" />
              <div className="mt-1">{s}</div>
              <div className="mt-3 text-neutral-400">Name, date and company stamp</div>
            </div>
          ))}
        </section>
      )}

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        {d.preparedBy && (
          <>
            Prepared by <strong className="text-neutral-700">{d.preparedBy}</strong>.{" "}
          </>
        )}
        {brand.website && <>{brand.website}. </>}
        This is a computer-generated document.
      </footer>
    </article>
  );
}

