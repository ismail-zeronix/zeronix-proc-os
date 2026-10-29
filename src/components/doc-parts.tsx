import { docFont } from "@/components/doc-font";

/**
 * The building blocks every customer document shares (quotation, proforma, delivery note, tax invoice, credit note), so
 * they all read as one family: same header, brand bar, info strip, address panels, table head, totals and footer.
 * Fixed light colours: it is paper, also in dark mode.
 */

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
export const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[9.5px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">{children}</div>;
}

/** The sheet itself. On screen it has its own padding; on paper the @page margins of PrintPage are the only white space. */
export function DocSheet({ label, stamp, children }: { label: string; stamp?: string; children: React.ReactNode }) {
  return (
    <article
      className={`${docFont.className} relative bg-white px-6 py-7 text-[12px] leading-normal text-neutral-800 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] sm:px-10 sm:py-9 print:p-0`}
      aria-label={label}
    >
      {stamp && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden>
          <span className="-rotate-30 rounded-xl border-8 border-red-600/30 px-8 py-2 text-7xl font-black tracking-widest text-red-600/25">{stamp}</span>
        </div>
      )}
      {children}
    </article>
  );
}

/** Logo and our details on the left, the document title and number on the right, then the brand bar. */
export function DocHeader({ brand, title, number }: { brand: QuoteBrand; title: string; number: string }) {
  const accent = safeColor(brand.color);
  return (
    <div className="break-inside-avoid break-after-avoid">
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
            {brand.trn && <div className="font-medium text-neutral-800">TRN: {brand.trn}</div>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[26px] leading-none font-extrabold tracking-tight" style={{ color: accent }}>
            {title}
          </div>
          <div className="mt-2 inline-block rounded-md px-2.5 py-1 text-[12px] font-bold tracking-wide text-neutral-900" style={{ background: tint(accent, 10) }}>
            {number}
          </div>
        </div>
      </header>
      {/* the brand bar: a strong start that fades into a hairline */}
      <div className="mt-4 h-0.75 rounded-full" style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent} 22%, ${tint(accent, 18)} 22%, #eef1ee 100%)` }} />
    </div>
  );
}

/** Dates, references and terms in one ruled strip; more than six wrap onto a second row. */
export function MetaStrip({ items }: { items: [string, string][] }) {
  const cols = items.length <= 6 ? items.length : Math.ceil(items.length / 2);
  return (
    <section
      className="mt-4 grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 break-inside-avoid break-after-avoid"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map(([k, v]) => (
        <div key={k} className="bg-white px-3 py-2">
          <Label>{k}</Label>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-neutral-900">{v}</div>
        </div>
      ))}
    </section>
  );
}

/** One address panel: the customer gets the tinted one with the brand edge, any second one is outlined. */
export function Party({ label, name, lines, accent, primary }: { label: string; name?: string; lines: string[]; accent: string; primary?: boolean }) {
  return (
    <div
      className={`rounded-lg py-2.5 pr-3 pl-3.5 ${primary ? "" : "border border-neutral-200"}`}
      style={primary ? { background: tint(accent, 5), boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
    >
      <Label>{label}</Label>
      {name && <div className="mt-1 text-[13px] font-bold text-neutral-900">{name}</div>}
      <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-600">
        {lines.filter(Boolean).map((l, i) => (
          <div key={i} className="whitespace-pre-line">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The row of address panels under the strip. */
export function Parties({ children, count }: { children: React.ReactNode; count: number }) {
  const cols = count >= 3 ? "grid-cols-3" : count === 2 ? "grid-cols-2" : "grid-cols-1";
  return <section className={`mt-4 grid gap-3 break-inside-avoid break-after-avoid ${cols}`}>{children}</section>;
}

/**
 * The lines table. The head repeats at the top of every printed page, a row is never cut in half, and the scroll
 * wrapper (for phones) is switched off on paper so the table can run across pages.
 */
export function LinesTable({ accent, head, children }: { accent: string; head: { label: string; className?: string }[]; children: React.ReactNode }) {
  return (
    <div className="mt-5 overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-120 border-separate border-spacing-0 text-[11.5px] print:min-w-0">
        <thead className="table-header-group">
          <tr className="text-left text-[9.5px] tracking-widest text-white uppercase">
            {head.map((h, n) => (
              <th
                key={h.label}
                className={`px-2.5 py-2 font-semibold ${n === 0 ? "rounded-l-md" : ""} ${n === head.length - 1 ? "rounded-r-md" : ""} ${h.className ?? ""}`}
                style={{ background: accent }}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Class of a lines-table cell. */
export const cell = "border-b border-neutral-200 px-2.5 py-1.5";
/**
 * Class of a line row: never cut in half. (Keeping the last rows with the totals via break-after made Chromium split
 * the totals block instead, so the totals simply move to the next page whole when they do not fit.)
 */
export const rowClass = "break-inside-avoid align-top";
/** Every other line gets a faint fill. */
export const zebra = (n: number) => (n % 2 ? { background: "#fafbfa" } : undefined);

/**
 * Amount in words (and anything else passed in, such as bank details) on the left, subtotal / VAT / total on the
 * right; kept together on one page.
 */
export function TotalsBlock({ accent, rows, total, words, children }: { accent: string; rows: [string, string][]; total: string; words?: string; children?: React.ReactNode }) {
  return (
    <section className="mt-4 flex items-start justify-between gap-6 break-inside-avoid">
      <div className="grid min-w-0 flex-1 gap-3 pt-1">
        {words && (
          <div>
            <Label>Amount in words</Label>
            <div className="mt-1 text-[11px] font-medium text-neutral-700 italic">{words}</div>
          </div>
        )}
        {children}
      </div>
      <div className="w-64 shrink-0 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between px-3 py-1">
            <span className="text-neutral-600">{k}</span>
            <span className="tabular-nums">{v}</span>
          </div>
        ))}
        <div className="mt-1.5 flex items-baseline justify-between rounded-md px-3 py-2 text-white" style={{ background: accent }}>
          <span className="text-[11px] font-semibold tracking-wide uppercase">Total</span>
          <span className="text-[15px] font-extrabold tabular-nums">AED {total}</span>
        </div>
      </div>
    </section>
  );
}

/** A numbered list such as terms or notes; lines are never split between pages. */
export function NumberedList({ label, items, accent }: { label: string; items: string[]; accent: string }) {
  return (
    <div>
      <div className="break-after-avoid">
        <Label>{label}</Label>
      </div>
      <ol className="mt-1.5 grid gap-0.5 text-[10.5px] leading-relaxed text-neutral-600">
        {items.map((t, n) => (
          <li key={n} className="flex gap-2 break-inside-avoid">
            <span className="font-semibold tabular-nums" style={{ color: accent }}>
              {n + 1}.
            </span>
            <span className="whitespace-pre-line">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DocFooter({ left, brand }: { left: React.ReactNode; brand: QuoteBrand }) {
  return (
    <footer className="mt-6 flex items-center justify-between gap-4 border-t border-neutral-200 pt-2.5 text-[9.5px] text-neutral-500 break-inside-avoid">
      <span>{left}</span>
      <span>{[brand.company, brand.website].filter(Boolean).join("  ·  ")}</span>
    </footer>
  );
}
