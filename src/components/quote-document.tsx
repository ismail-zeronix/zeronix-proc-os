import { Fragment } from "react";
import { docFont } from "@/components/doc-font";
import { dubaiToday } from "@/lib/dates";
import { lineTotal, longDay } from "@/lib/quotation";
import { aedInWords } from "@/lib/words";

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

export const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#048b3e");
/** The brand colour mixed into white, for soft panels that still print. */
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;
/** Amounts on paper always carry two decimals so the columns line up. */
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[9.5px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">{children}</div>;
}

/**
 * The quotation as the customer sees it. Fixed light colours (it is a paper document, also in dark mode) and no
 * cost or margin anywhere. Used on the quote page and the print page; when printing the page margins are the only
 * white space around it.
 */
export function QuoteDocument({ q, brand }: { q: QuoteDocData; brand: QuoteBrand }) {
  const accent = safeColor(brand.color);
  const terms = q.terms.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  const authorPhone = q.author ? q.author.mobile || q.author.phone : "";
  return (
    <article
      className={`${docFont.className} bg-white px-6 py-7 text-[12px] leading-normal text-neutral-800 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] sm:px-10 sm:py-9 print:p-0`}
      aria-label={`Quotation ${q.number}`}
    >
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {brand.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoSrc} alt={brand.company} className="max-h-14 max-w-52 object-contain" />
          ) : (
            <div className="text-xl font-extrabold tracking-tight text-neutral-900">{brand.company}</div>
          )}
          <div className="mt-2.5 text-[10.5px] leading-relaxed text-neutral-600">
            <div className="font-semibold text-neutral-900">{brand.company}</div>
            {brand.address && <div className="whitespace-pre-line">{brand.address}</div>}
            <div>{[brand.mainPhone, brand.website].filter(Boolean).join("  ·  ")}</div>
            {brand.trn && <div>TRN: {brand.trn}</div>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[30px] leading-none font-extrabold tracking-tight" style={{ color: accent }}>
            QUOTATION
          </div>
          <div className="mt-2 inline-block rounded-md px-2.5 py-1 text-[12px] font-bold tracking-wide text-neutral-900" style={{ background: tint(accent, 10) }}>
            {q.number}
          </div>
        </div>
      </header>

      {/* the brand bar: a strong start that fades into a hairline */}
      <div className="mt-4 h-[3px] rounded-full" style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent} 22%, ${tint(accent, 18)} 22%, #eef1ee 100%)` }} />

      <section className="mt-4 grid grid-cols-4 overflow-hidden rounded-lg border border-neutral-200">
        {[
          ["Quotation no.", q.number],
          ["Date", longDay(dubaiToday(q.createdAt))],
          ["Valid until", longDay(q.validUntil)],
          ["Sales contact", q.author?.name ?? brand.company],
        ].map(([k, v], n) => (
          <div key={k} className={`px-3 py-2 ${n ? "border-l border-neutral-200" : ""}`}>
            <Label>{k}</Label>
            <div className="mt-0.5 truncate text-[12px] font-semibold text-neutral-900">{v}</div>
          </div>
        ))}
      </section>

      <section className={`mt-4 grid gap-3 ${q.contact ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="rounded-lg py-2.5 pr-3 pl-3.5" style={{ background: tint(accent, 5), boxShadow: `inset 3px 0 0 ${accent}` }}>
          <Label>Quotation for</Label>
          <div className="mt-1 text-[13px] font-bold text-neutral-900">{q.company.name}</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-600">
            {q.company.address ? <div className="whitespace-pre-line">{q.company.address}</div> : q.company.emirate && <div>{q.company.emirate}, UAE</div>}
            {q.company.phone && <div>Tel: {q.company.phone}</div>}
            {q.company.trn && <div>TRN: {q.company.trn}</div>}
          </div>
        </div>
        {q.contact && (
          <div className="rounded-lg border border-neutral-200 px-3.5 py-2.5">
            <Label>Attention</Label>
            <div className="mt-1 text-[13px] font-bold text-neutral-900">{q.contact.name}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-600">
              {q.contact.jobTitle && <div>{q.contact.jobTitle}</div>}
              {q.contact.email && <div>{q.contact.email}</div>}
              {q.contact.phone && <div>{q.contact.phone}</div>}
            </div>
          </div>
        )}
      </section>

      <div className="mt-5 overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[480px] border-separate border-spacing-0 text-[11.5px]">
          <thead>
            <tr className="text-left text-[9.5px] tracking-[0.1em] text-white uppercase">
              <th className="w-9 rounded-l-md px-2.5 py-2 font-semibold" style={{ background: accent }}>
                #
              </th>
              <th className="px-2.5 py-2 font-semibold" style={{ background: accent }}>
                Item &amp; description
              </th>
              <th className="w-16 px-2.5 py-2 text-right font-semibold" style={{ background: accent }}>
                Qty
              </th>
              <th className="w-28 px-2.5 py-2 text-right font-semibold" style={{ background: accent }}>
                Rate (AED)
              </th>
              <th className="w-28 rounded-r-md px-2.5 py-2 text-right font-semibold" style={{ background: accent }}>
                Amount (AED)
              </th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((i, n) => {
              const section = i.section ?? "";
              // a project quote is grouped: a heading row each time the section changes, with that section's subtotal
              const heading = section && section !== (q.items[n - 1]?.section ?? "");
              const sectionTotal = heading ? q.items.filter((x) => x.section === section).reduce((s, x) => s + lineTotal({ qty: x.qty, unitPrice: x.unitPrice }), 0) : 0;
              const cell = "border-b border-neutral-200 px-2.5 py-2";
              return (
                <Fragment key={i.id}>
                  {heading && (
                    <tr className="break-inside-avoid">
                      <td colSpan={4} className="border-b px-2.5 pt-3 pb-1.5 text-[11.5px] font-bold" style={{ color: accent, borderColor: tint(accent, 35) }}>
                        {section}
                      </td>
                      <td className="border-b px-2.5 pt-3 pb-1.5 text-right font-bold tabular-nums" style={{ borderColor: tint(accent, 35) }}>
                        {amt(sectionTotal)}
                      </td>
                    </tr>
                  )}
                  <tr className="break-inside-avoid align-top" style={n % 2 ? { background: "#fafbfa" } : undefined}>
                    <td className={`${cell} text-neutral-400 tabular-nums`}>{String(n + 1).padStart(2, "0")}</td>
                    <td className={`${cell} whitespace-pre-line text-neutral-900`}>{i.description}</td>
                    <td className={`${cell} text-right whitespace-nowrap tabular-nums`}>
                      {i.qty}
                      {i.unit ? <span className="text-neutral-500"> {i.unit}</span> : null}
                    </td>
                    <td className={`${cell} text-right tabular-nums`}>{amt(i.unitPrice)}</td>
                    <td className={`${cell} text-right font-semibold text-neutral-900 tabular-nums`}>{amt(lineTotal({ qty: i.qty, unitPrice: i.unitPrice }))}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex items-start justify-between gap-6 break-inside-avoid">
        <div className="max-w-[55%] pt-1">
          <Label>Amount in words</Label>
          <div className="mt-1 text-[11px] font-medium text-neutral-700 italic">{aedInWords(q.total)}</div>
        </div>
        <div className="w-64 shrink-0 text-[12px]">
          <div className="flex justify-between px-3 py-1">
            <span className="text-neutral-600">Subtotal</span>
            <span className="tabular-nums">{amt(q.subtotal)}</span>
          </div>
          {/* a zero-rated supply still says so on the document */}
          <div className="flex justify-between px-3 py-1">
            <span className="text-neutral-600">{q.vatPct > 0 ? `VAT (${q.vatPct}%)` : "VAT 0% (zero-rated)"}</span>
            <span className="tabular-nums">{amt(q.vatAmount)}</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between rounded-md px-3 py-2 text-white" style={{ background: accent }}>
            <span className="text-[11px] font-semibold tracking-wide uppercase">Total</span>
            <span className="text-[15px] font-extrabold tabular-nums">AED {amt(q.total)}</span>
          </div>
        </div>
      </section>

      <section className={`mt-6 grid gap-6 break-inside-avoid ${q.author ? "grid-cols-[1fr_13rem]" : "grid-cols-1"}`}>
        {terms.length > 0 ? (
          <div>
            <Label>Terms &amp; conditions</Label>
            <ol className="mt-1.5 grid gap-0.5 text-[10.5px] leading-relaxed text-neutral-600">
              {terms.map((t, n) => (
                <li key={n} className="flex gap-2">
                  <span className="font-semibold tabular-nums" style={{ color: accent }}>
                    {n + 1}.
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div />
        )}
        {q.author && (
          <div className="text-[10.5px] leading-relaxed text-neutral-600">
            <Label>Prepared by</Label>
            <div className="mt-1.5 text-[12px] font-bold text-neutral-900">{q.author.name}</div>
            {q.author.jobTitle && <div>{q.author.jobTitle}</div>}
            {q.author.email && <div>{q.author.email}</div>}
            {authorPhone && <div>{authorPhone}</div>}
          </div>
        )}
      </section>

      <footer className="mt-6 flex items-center justify-between gap-4 border-t border-neutral-200 pt-2.5 text-[9.5px] text-neutral-500 break-inside-avoid">
        <span>Thank you for your business.</span>
        <span>{[brand.company, brand.website].filter(Boolean).join("  ·  ")}</span>
      </footer>
    </article>
  );
}
