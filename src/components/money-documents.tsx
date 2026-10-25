import type { QuoteBrand } from "@/components/quote-document";
import { methodLabel, type StatementLine } from "@/lib/invoicing";
import { longDay, money } from "@/lib/quotation";
import { aedInWords } from "@/lib/words";

const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#2a78d6");

function Head({ brand, title, number, meta }: { brand: QuoteBrand; title: string; number: string; meta: [string, string][] }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: safeColor(brand.color) }}>
      <div>
        {brand.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoSrc} alt={brand.company} className="max-h-14 max-w-56 object-contain" />
        ) : (
          <div className="text-2xl font-bold tracking-tight text-neutral-900">{brand.company}</div>
        )}
        <div className="mt-1 text-xs whitespace-pre-line text-neutral-500">
          {[brand.address, brand.mainPhone && `Tel: ${brand.mainPhone}`, brand.trn && `TRN: ${brand.trn}`].filter(Boolean).join("\n")}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xl font-semibold tracking-wide text-neutral-900">{title}</div>
        {number && <div className="font-mono text-sm font-medium">{number}</div>}
        <dl className="mt-1 grid grid-cols-[auto_auto] justify-end gap-x-2 text-xs text-neutral-600">
          {meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}:</dt>
              <dd className="text-left font-medium text-neutral-800">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

export interface ReceiptData {
  number: string;
  paidOn: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
  customerName: string;
  invoiceNumber: string;
  invoiceTotal: number;
  /** Still owed on the invoice after this and earlier payments. */
  balanceAfter: number;
  byName: string | null;
  voided: string | null;
}

/** Receipt voucher for money received. */
export function ReceiptDocument({ r, brand }: { r: ReceiptData; brand: QuoteBrand }) {
  return (
    <article className="relative bg-white p-6 text-[13px] leading-relaxed text-neutral-800 sm:p-10" aria-label={`Receipt ${r.number}`}>
      {r.voided && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-30 rounded-xl border-8 border-red-600/30 px-8 py-2 text-7xl font-black tracking-widest text-red-600/25">VOID</span>
        </div>
      )}
      <Head brand={brand} title="RECEIPT VOUCHER" number={r.number} meta={[["Date", longDay(r.paidOn)]]} />
      <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2.5">
        <dt className="text-neutral-500">Received from</dt>
        <dd className="font-semibold">{r.customerName}</dd>
        <dt className="text-neutral-500">The sum of</dt>
        <dd>
          <span className="text-lg font-semibold tabular-nums">{money(r.amount)}</span>
          <div className="text-xs text-neutral-600 italic">{aedInWords(r.amount)}</div>
        </dd>
        <dt className="text-neutral-500">Paid by</dt>
        <dd>
          {methodLabel(r.method)}
          {r.reference ? ` · Ref. ${r.reference}` : ""}
        </dd>
        <dt className="text-neutral-500">Against invoice</dt>
        <dd>
          {r.invoiceNumber} ({money(r.invoiceTotal)})
        </dd>
        <dt className="text-neutral-500">Balance on the invoice</dt>
        <dd className="font-medium">{r.balanceAfter > 0 ? money(r.balanceAfter) : "Fully paid"}</dd>
        {r.notes && (
          <>
            <dt className="text-neutral-500">Note</dt>
            <dd>{r.notes}</dd>
          </>
        )}
        {r.voided && (
          <>
            <dt className="text-red-700">Voided</dt>
            <dd className="text-red-700">{r.voided}</dd>
          </>
        )}
      </dl>
      <section className="mt-14 grid grid-cols-2 gap-10 text-xs text-neutral-600">
        <div>
          <div className="h-10 border-b border-neutral-400" />
          <div className="mt-1">Received by{r.byName ? `: ${r.byName}` : ""}</div>
        </div>
        <div>
          <div className="h-10 border-b border-neutral-400" />
          <div className="mt-1">Company stamp</div>
        </div>
      </section>
    </article>
  );
}

export interface VoucherData {
  number: string;
  paidOn: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
  payee: string;
  payeeTrn: string | null;
  billNumber: string;
  billTotal: number;
  supplierRef: string;
  category: string;
  /** Still to pay on the bill after this and earlier payments. */
  balanceAfter: number;
  byName: string | null;
  voided: string | null;
}

/** Payment voucher for money paid out (a supplier bill or an expense), signed by whoever received it. */
export function VoucherDocument({ v, brand }: { v: VoucherData; brand: QuoteBrand }) {
  return (
    <article className="relative bg-white p-6 text-[13px] leading-relaxed text-neutral-800 sm:p-10" aria-label={`Payment voucher ${v.number}`}>
      {v.voided && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-30 rounded-xl border-8 border-red-600/30 px-8 py-2 text-7xl font-black tracking-widest text-red-600/25">VOID</span>
        </div>
      )}
      <Head brand={brand} title="PAYMENT VOUCHER" number={v.number} meta={[["Date", longDay(v.paidOn)]]} />
      <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2.5">
        <dt className="text-neutral-500">Paid to</dt>
        <dd className="font-semibold">
          {v.payee}
          {v.payeeTrn && <span className="ml-2 text-xs font-normal text-neutral-500">TRN {v.payeeTrn}</span>}
        </dd>
        <dt className="text-neutral-500">The sum of</dt>
        <dd>
          <span className="text-lg font-semibold tabular-nums">{money(v.amount)}</span>
          <div className="text-xs text-neutral-600 italic">{aedInWords(v.amount)}</div>
        </dd>
        <dt className="text-neutral-500">Paid by</dt>
        <dd>
          {methodLabel(v.method)}
          {v.reference ? ` · Ref. ${v.reference}` : ""}
        </dd>
        <dt className="text-neutral-500">For</dt>
        <dd>
          {v.category} · {v.billNumber}
          {v.supplierRef ? ` (their invoice ${v.supplierRef})` : ""} · {money(v.billTotal)}
        </dd>
        <dt className="text-neutral-500">Still to pay</dt>
        <dd className="font-medium">{v.balanceAfter > 0 ? money(v.balanceAfter) : "Fully paid"}</dd>
        {v.notes && (
          <>
            <dt className="text-neutral-500">Note</dt>
            <dd>{v.notes}</dd>
          </>
        )}
        {v.voided && (
          <>
            <dt className="text-red-700">Voided</dt>
            <dd className="text-red-700">{v.voided}</dd>
          </>
        )}
      </dl>
      <section className="mt-14 grid grid-cols-3 gap-8 text-xs text-neutral-600">
        <div>
          <div className="h-10 border-b border-neutral-400" />
          <div className="mt-1">Prepared by{v.byName ? `: ${v.byName}` : ""}</div>
        </div>
        <div>
          <div className="h-10 border-b border-neutral-400" />
          <div className="mt-1">Approved by</div>
        </div>
        <div>
          <div className="h-10 border-b border-neutral-400" />
          <div className="mt-1">Received by (name and signature)</div>
        </div>
      </section>
    </article>
  );
}

export interface StatementData {
  customer: { name: string; emirate: string; trn: string };
  from: string;
  to: string;
  opening: number;
  lines: StatementLine[];
  closing: number;
}

/** Statement of account: balance brought forward, every invoice, credit note and payment, running balance. */
export function StatementDocument({ s, brand }: { s: StatementData; brand: QuoteBrand }) {
  const accent = safeColor(brand.color);
  return (
    <article className="bg-white p-6 text-[13px] leading-relaxed text-neutral-800 sm:p-10" aria-label={`Statement for ${s.customer.name}`}>
      <Head
        brand={brand}
        title="STATEMENT OF ACCOUNT"
        number=""
        meta={[
          ["From", longDay(s.from)],
          ["To", longDay(s.to)],
        ]}
      />
      <section className="mt-4">
        <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Customer</div>
        <div className="font-semibold">{s.customer.name}</div>
        {s.customer.emirate && <div>{s.customer.emirate}, United Arab Emirates</div>}
        {s.customer.trn && <div>TRN: {s.customer.trn}</div>}
      </section>
      <table className="mt-5 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 bg-neutral-100 text-left text-[11px] tracking-wider text-neutral-700 uppercase" style={{ borderColor: accent }}>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 font-medium">Document</th>
            <th className="px-2 py-1.5 font-medium">Details</th>
            <th className="px-2 py-1.5 text-right font-medium">Invoiced</th>
            <th className="px-2 py-1.5 text-right font-medium">Paid / credited</th>
            <th className="px-2 py-1.5 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-200">
            <td className="px-2 py-1.5">{longDay(s.from)}</td>
            <td className="px-2 py-1.5" colSpan={4}>
              Balance brought forward
            </td>
            <td className="px-2 py-1.5 text-right font-medium tabular-nums">{money(s.opening)}</td>
          </tr>
          {s.lines.map((l, i) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className="px-2 py-1.5 whitespace-nowrap">{longDay(l.date)}</td>
              <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{l.number}</td>
              <td className="px-2 py-1.5 text-xs text-neutral-600">
                {l.kind === "invoice" ? "Invoice" : l.kind === "payment" ? "Payment" : "Credit note"}
                {l.note ? ` · ${l.note}` : ""}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(l.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 ml-auto flex w-full max-w-72 justify-between border-t-2 pt-1.5 text-base font-semibold" style={{ borderColor: accent }}>
        <span>Balance due</span>
        <span className="tabular-nums">{money(s.closing)}</span>
      </div>
      <p className="mt-6 text-xs text-neutral-500">Please tell us within 7 days if anything on this statement does not match your records. This is a computer-generated document.</p>
    </article>
  );
}
