import { Fragment } from "react";
import { amt, cell, DocFooter, DocHeader, DocSheet, Label, LinesTable, MetaStrip, NumberedList, Parties, Party, type QuoteBrand, rowClass, safeColor, tint, TotalsBlock, zebra } from "@/components/doc-parts";
import { dubaiToday } from "@/lib/dates";
import { lineTotal, longDay } from "@/lib/quotation";
import { aedInWords } from "@/lib/words";

export { type QuoteBrand, safeColor, tint };

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

/**
 * The quotation as the customer sees it: one document, no cost or margin anywhere. Used on the quote page and the
 * print page, in the same layout as the invoices (see doc-parts).
 */
export function QuoteDocument({ q, brand }: { q: QuoteDocData; brand: QuoteBrand }) {
  const accent = safeColor(brand.color);
  const terms = q.terms.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  const authorPhone = q.author ? q.author.mobile || q.author.phone : "";
  return (
    <DocSheet label={`Quotation ${q.number}`}>
      <DocHeader brand={brand} title="QUOTATION" number={q.number} />

      <MetaStrip
        items={[
          ["Quotation no.", q.number],
          ["Date", longDay(dubaiToday(q.createdAt))],
          ["Valid until", longDay(q.validUntil)],
          ["Sales contact", q.author?.name ?? brand.company],
        ]}
      />

      <Parties count={q.contact ? 2 : 1}>
        <Party
          primary
          accent={accent}
          label="Quotation for"
          name={q.company.name}
          lines={[
            q.company.address || (q.company.emirate ? `${q.company.emirate}, UAE` : ""),
            q.company.phone && `Tel: ${q.company.phone}`,
            q.company.trn && `TRN: ${q.company.trn}`,
          ]}
        />
        {q.contact && <Party accent={accent} label="Attention" name={q.contact.name} lines={[q.contact.jobTitle, q.contact.email, q.contact.phone]} />}
      </Parties>

      <LinesTable
        accent={accent}
        head={[
          { label: "#", className: "w-9" },
          { label: "Item & description" },
          { label: "Qty", className: "w-16 text-right" },
          { label: "Rate (AED)", className: "w-28 text-right" },
          { label: "Amount (AED)", className: "w-28 text-right" },
        ]}
      >
        {q.items.map((i, n) => {
          const section = i.section ?? "";
          // a project quote is grouped: a heading row each time the section changes, with that section's subtotal
          const heading = section && section !== (q.items[n - 1]?.section ?? "");
          const sectionTotal = heading ? q.items.filter((x) => x.section === section).reduce((s, x) => s + lineTotal({ qty: x.qty, unitPrice: x.unitPrice }), 0) : 0;
          return (
            <Fragment key={i.id}>
              {heading && (
                // a section heading never ends a page on its own
                <tr className="break-inside-avoid break-after-avoid">
                  <td colSpan={4} className="border-b px-2.5 pt-3 pb-1.5 text-[11.5px] font-bold" style={{ color: accent, borderColor: tint(accent, 35) }}>
                    {section}
                  </td>
                  <td className="border-b px-2.5 pt-3 pb-1.5 text-right font-bold tabular-nums" style={{ borderColor: tint(accent, 35) }}>
                    {amt(sectionTotal)}
                  </td>
                </tr>
              )}
              <tr className={rowClass} style={zebra(n)}>
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
      </LinesTable>

      <TotalsBlock
        accent={accent}
        words={aedInWords(q.total)}
        total={amt(q.total)}
        rows={[
          ["Subtotal", amt(q.subtotal)],
          // a zero-rated supply still says so on the document
          [q.vatPct > 0 ? `VAT (${q.vatPct}%)` : "VAT 0% (zero-rated)", amt(q.vatAmount)],
        ]}
      />

      {(terms.length > 0 || q.author) && (
        <section className={`mt-6 grid gap-6 ${q.author ? "grid-cols-[1fr_13rem]" : "grid-cols-1"}`}>
          {terms.length > 0 ? <NumberedList label="Terms & conditions" items={terms} accent={accent} /> : <div />}
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
      )}

      <DocFooter brand={brand} left="Thank you for your business." />
    </DocSheet>
  );
}
