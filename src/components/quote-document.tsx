import { Fragment } from "react";
import { dubaiToday } from "@/lib/dates";
import { lineTotal, longDay, money } from "@/lib/quotation";

export interface QuoteDocData {
  number: string;
  createdAt: Date;
  validUntil: string;
  vatPct: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  terms: string;
  /** `section` and `unit` come from a project BOQ; product quotes leave them empty. */
  items: { id: number; description: string; qty: number; unitPrice: number; section?: string; unit?: string }[];
  company: { name: string; emirate: string; address: string; trn: string; phone: string };
  contact: { name: string; jobTitle: string; email: string; phone: string } | null;
  author: { name: string; email: string; jobTitle: string; phone: string; mobile: string } | null;
}

export interface QuoteBrand {
  company: string;
  tagline: string;
  address: string;
  website: string;
  mainPhone: string;
  color: string;
  trn: string;
  logoSrc: string | null;
}

const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#2a78d6");

/**
 * The quotation as the customer sees it. Fixed light colours (it is a paper document, also in dark mode) and no
 * cost or margin anywhere. Used on the quote page and the print page.
 */
export function QuoteDocument({ q, brand }: { q: QuoteDocData; brand: QuoteBrand }) {
  const accent = safeColor(brand.color);
  const terms = q.terms.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  return (
    <article className="bg-white p-6 text-[13px] leading-relaxed text-neutral-800 sm:p-10" aria-label={`Quotation ${q.number}`}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div>
          {brand.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoSrc} alt={brand.company} className="max-h-14 max-w-56 object-contain" />
          ) : (
            <div className="text-2xl font-bold tracking-tight text-neutral-900">
              {brand.company}
            </div>
          )}
          {brand.tagline && <div className="mt-1 text-xs text-neutral-500">{brand.tagline}</div>}
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tracking-wide text-neutral-900">QUOTATION</div>
          <div className="font-mono text-sm font-medium">{q.number}</div>
          <div className="mt-1 text-xs text-neutral-600">
            Date: {longDay(dubaiToday(q.createdAt))}
            <br />
            Valid until: <strong>{longDay(q.validUntil)}</strong>
          </div>
        </div>
      </header>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">From</div>
          <div className="font-semibold">{brand.company}</div>
          {brand.address && <div className="whitespace-pre-line">{brand.address}</div>}
          {brand.mainPhone && <div>Tel: {brand.mainPhone}</div>}
          {brand.website && <div>{brand.website}</div>}
          {brand.trn && <div>TRN: {brand.trn}</div>}
        </div>
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">To</div>
          <div className="font-semibold">{q.company.name}</div>
          {q.company.address ? <div className="whitespace-pre-line">{q.company.address}</div> : q.company.emirate && <div>{q.company.emirate}, UAE</div>}
          {q.company.trn && <div>TRN: {q.company.trn}</div>}
          {q.contact && (
            <div className="mt-1">
              Attn: {q.contact.name}
              {q.contact.jobTitle ? `, ${q.contact.jobTitle}` : ""}
              {q.contact.email && <div>{q.contact.email}</div>}
              {q.contact.phone && <div>{q.contact.phone}</div>}
            </div>
          )}
        </div>
      </section>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 bg-neutral-100 text-left text-[11px] tracking-wider text-neutral-700 uppercase" style={{ borderColor: accent }}>
              <th className="w-8 px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="w-14 px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="w-28 px-2 py-1.5 text-right font-medium">Unit price</th>
              <th className="w-28 px-2 py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((i, n) => {
              const section = i.section ?? "";
              // a project quote is grouped: a heading row each time the section changes, with that section's subtotal
              const heading = section && section !== (q.items[n - 1]?.section ?? "");
              const sectionTotal = heading ? q.items.filter((x) => x.section === section).reduce((s, x) => s + lineTotal({ qty: x.qty, unitPrice: x.unitPrice }), 0) : 0;
              return (
                <Fragment key={i.id}>
                  {heading && (
                    <tr className="border-b border-neutral-300 bg-neutral-50 break-inside-avoid">
                      <td colSpan={4} className="px-2 pt-2.5 pb-1 text-[12px] font-semibold" style={{ color: accent }}>
                        {section}
                      </td>
                      <td className="px-2 pt-2.5 pb-1 text-right text-[12px] font-semibold tabular-nums">{money(sectionTotal)}</td>
                    </tr>
                  )}
                  <tr className="border-b border-neutral-200 align-top">
                    <td className="px-2 py-2 text-neutral-500">{n + 1}</td>
                    <td className="px-2 py-2">{i.description}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                      {i.qty}
                      {i.unit ? <span className="text-neutral-500"> {i.unit}</span> : null}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(i.unitPrice)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(lineTotal({ qty: i.qty, unitPrice: i.unitPrice }))}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 ml-auto grid w-full max-w-64 gap-1 text-[13px]">
        <div className="flex justify-between">
          <span className="text-neutral-600">Subtotal</span>
          <span className="tabular-nums">{money(q.subtotal)}</span>
        </div>
        {/* a zero-rated supply still says so on the document */}
        <div className="flex justify-between">
          <span className="text-neutral-600">{q.vatPct > 0 ? `VAT ${q.vatPct}%` : "VAT 0% (zero-rated)"}</span>
          <span className="tabular-nums">{money(q.vatAmount)}</span>
        </div>
        <div className="flex justify-between border-t-2 pt-1.5 text-base font-semibold" style={{ borderColor: accent }}>
          <span>Total</span>
          <span className="tabular-nums">{money(q.total)}</span>
        </div>
      </div>

      {terms.length > 0 && (
        <section className="mt-6">
          <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Terms</div>
          <ul className="mt-1 list-disc pl-5 text-xs text-neutral-700">
            {terms.map((t, n) => (
              <li key={n}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {q.author && (
        <footer className="mt-6 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
          Prepared by <strong className="text-neutral-800">{q.author.name}</strong>
          {q.author.jobTitle ? `, ${q.author.jobTitle}` : ""}
          <br />
          {[q.author.email, q.author.mobile || q.author.phone].filter(Boolean).join("  |  ")}
        </footer>
      )}
    </article>
  );
}
