import { DOC_FONTS, type DocStyle, docStyleVars, LOGO_SIZE, onColor, PRESETS, safeColor, tint, withAccent } from "@/lib/doc-style";

/**
 * The building blocks every customer document shares (quotation, proforma, delivery note, tax invoice, credit note), so
 * they all read as one family: same header, brand bar, info strip, address panels, table head, totals and footer.
 * Their look follows the document template (lib/doc-style.ts): colours and lines through CSS variables on the sheet
 * (the .zx-doc rules in globals.css), layout switches through `brand.style`. Fixed light colours: it is paper, also in
 * dark mode.
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
  /** The document template with its accent filled in; missing = Classic in the brand colour. */
  style?: DocStyle;
  /** The white logo, for the Bold template's colour band. */
  logoDarkSrc?: string | null;
  /** Shown under the totals when the template asks for them. */
  signatureSrc?: string | null;
  stampSrc?: string | null;
}

export { safeColor, tint };
/** Amounts on paper always carry two decimals so the columns line up. */
export const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The style a document draws with. */
export const styleOf = (brand: QuoteBrand): DocStyle => brand.style ?? withAccent(PRESETS.classic, brand.color);

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[9.5px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">{children}</div>;
}

/** The sheet itself. On screen it has its own padding; on paper the @page margins of PrintPage are the only white space. */
export function DocSheet({ label, stamp, brand, children }: { label: string; stamp?: string; brand: QuoteBrand; children: React.ReactNode }) {
  const s = styleOf(brand);
  return (
    <article
      className={`${DOC_FONTS[s.font]} zx-doc relative bg-white px-6 py-7 text-[12px] leading-normal text-neutral-800 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] sm:px-10 sm:py-9 print:p-0`}
      style={docStyleVars(s)}
      data-lines={s.rowLines}
      data-head={s.headFill}
      data-border={s.tableBorder}
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

function Logo({ brand, src, light }: { brand: QuoteBrand; src: string | null | undefined; light?: boolean }) {
  const s = styleOf(brand);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={brand.company} className={`${LOGO_SIZE[s.logoSize]} object-contain`} />
  ) : (
    <div className={`text-xl font-extrabold tracking-tight ${light ? "" : "text-neutral-900"}`}>{brand.company}</div>
  );
}

/** Our name, address, phone, website and TRN. */
function OurDetails({ brand, light, center }: { brand: QuoteBrand; light?: boolean; center?: boolean }) {
  return (
    <div className={`mt-2.5 text-[10.5px] leading-relaxed ${light ? "opacity-85" : "text-neutral-600"} ${center ? "text-center" : ""}`}>
      <div className={`font-semibold ${light ? "" : "text-neutral-900"}`}>{brand.company}</div>
      {brand.address && <div className="whitespace-pre-line">{brand.address}</div>}
      <div>{[brand.mainPhone, brand.website].filter(Boolean).join("  ·  ")}</div>
      {brand.trn && <div className={`font-medium ${light ? "" : "text-neutral-800"}`}>TRN: {brand.trn}</div>}
    </div>
  );
}

/** The rule under the header: a strong start that fades into a hairline, a solid line, or nothing. */
function BrandBar({ s }: { s: DocStyle }) {
  if (s.bar === "none" || s.barWidth <= 0) return null;
  const background = s.bar === "solid" ? s.accent : `linear-gradient(90deg, ${s.accent} 0%, ${s.accent} 22%, ${tint(s.accent, 18)} 22%, #eef1ee 100%)`;
  return <div className="mt-4 rounded-full" style={{ height: s.barWidth, background }} />;
}

/** Logo and our details, the document title and number, then the brand bar; laid out as the template says. */
export function DocHeader({ brand, title, number }: { brand: QuoteBrand; title: string; number: string }) {
  const s = styleOf(brand);
  const accent = s.accent;
  if (s.header === "band") {
    const fg = onColor(accent);
    const dark = fg === "#ffffff";
    // on a dark band: the white logo when there is one, else the normal logo on a white chip
    const logo = dark && brand.logoDarkSrc ? <Logo brand={brand} src={brand.logoDarkSrc} light /> : brand.logoSrc ? (
      <div className={`inline-block ${dark ? "rounded-md bg-white px-2.5 py-1.5" : ""}`}>
        <Logo brand={brand} src={brand.logoSrc} />
      </div>
    ) : (
      <Logo brand={brand} src={null} light />
    );
    return (
      <div className="break-inside-avoid break-after-avoid">
        <header className="flex items-start justify-between gap-6 px-5 py-4" style={{ background: accent, color: fg, borderRadius: s.radius + 2 }}>
          <div className="min-w-0">
            {logo}
            <OurDetails brand={brand} light />
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[26px] leading-none font-extrabold tracking-tight">{title}</div>
            <div className="mt-2 inline-block rounded-md px-2.5 py-1 text-[12px] font-bold tracking-wide" style={{ background: dark ? "rgb(255 255 255 / 0.18)" : "rgb(0 0 0 / 0.08)" }}>
              {number}
            </div>
          </div>
        </header>
        <BrandBar s={s} />
      </div>
    );
  }
  const titleBlock = (
    <>
      <div className="text-[26px] leading-none font-extrabold tracking-tight" style={{ color: accent }}>
        {title}
      </div>
      <div className="mt-2 inline-block rounded-md px-2.5 py-1 text-[12px] font-bold tracking-wide text-neutral-900" style={{ background: tint(accent, 10) }}>
        {number}
      </div>
    </>
  );
  if (s.header === "centered") {
    return (
      <div className="break-inside-avoid break-after-avoid">
        <header className="grid justify-items-center">
          <Logo brand={brand} src={brand.logoSrc} />
          <OurDetails brand={brand} center />
        </header>
        <BrandBar s={s} />
        <div className="mt-4 text-center">{titleBlock}</div>
      </div>
    );
  }
  return (
    <div className="break-inside-avoid break-after-avoid">
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Logo brand={brand} src={brand.logoSrc} />
          <OurDetails brand={brand} />
        </div>
        <div className="shrink-0 text-right">{titleBlock}</div>
      </header>
      <BrandBar s={s} />
    </div>
  );
}

/** Dates, references and terms in one ruled strip; more than six wrap onto a second row. */
export function MetaStrip({ items }: { items: [string, string][] }) {
  const cols = items.length <= 6 ? items.length : Math.ceil(items.length / 2);
  return (
    <section
      className="zx-meta mt-4 grid gap-px overflow-hidden break-inside-avoid break-after-avoid"
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

/** One address panel: the customer's is the template's panel (tinted with the brand edge, outlined or plain), any second one is outlined. */
export function Party({ label, name, lines, s, primary }: { label: string; name?: string; lines: string[]; s: DocStyle; primary?: boolean }) {
  const plain = s.panel === "plain";
  const tinted = primary && s.panel === "tinted";
  return (
    <div
      className={`py-2.5 pr-3 ${plain ? "" : "pl-3.5"} ${tinted || plain ? "" : "zx-outline"}`}
      style={{ borderRadius: plain ? undefined : s.radius + 2, ...(tinted ? { background: tint(s.accent, 5), boxShadow: `inset 3px 0 0 ${s.accent}` } : undefined) }}
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
 * wrapper (for phones) is switched off on paper so the table can run across pages. Fill, lines and corners come from
 * the template's CSS variables.
 */
export function LinesTable({ head, children }: { head: { label: string; className?: string }[]; children: React.ReactNode }) {
  return (
    <div className="mt-5 overflow-x-auto print:overflow-visible">
      <table className="zx-table w-full min-w-120 border-separate border-spacing-0 text-[11.5px] print:min-w-0">
        <thead className="table-header-group">
          <tr className="text-left text-[9.5px] tracking-widest uppercase">
            {head.map((h) => (
              <th key={h.label} className={`zx-th px-2.5 py-2 font-semibold ${h.className ?? ""}`}>
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

/** Class of a lines-table cell (padding and row line from the template). */
export const cell = "zx-cell";
/**
 * Class of a line row: never cut in half. (Keeping the last rows with the totals via break-after made Chromium split
 * the totals block instead, so the totals simply move to the next page whole when they do not fit.)
 */
export const rowClass = "break-inside-avoid align-top";
/** Every other line gets a faint fill (when the template has zebra rows). */
export const zebra = (n: number) => (n % 2 ? { background: "var(--doc-zebra)" } : undefined);

/**
 * Amount in words (and anything else passed in, such as bank details) on the left, subtotal / VAT / total on the
 * right; kept together on one page.
 */
export function TotalsBlock({ s, rows, total, words, children }: { s: DocStyle; rows: [string, string][]; total: string; words?: string; children?: React.ReactNode }) {
  const shown = s.showWords ? words : undefined;
  const totalStyle =
    s.total === "filled"
      ? { background: s.accent, color: onColor(s.accent), borderRadius: s.radius }
      : s.total === "outlined"
        ? { border: `1.5px solid ${s.accent}`, color: s.accent, borderRadius: s.radius }
        : { borderTop: `2px solid ${s.text}`, color: s.text, borderRadius: 0 };
  return (
    <section className="mt-4 flex items-start justify-between gap-6 break-inside-avoid">
      <div className="grid min-w-0 flex-1 gap-3 pt-1">
        {shown && (
          <div>
            <Label>Amount in words</Label>
            <div className="mt-1 text-[11px] font-medium text-neutral-700 italic">{shown}</div>
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
        <div className="mt-1.5 flex items-baseline justify-between px-3 py-2" style={totalStyle}>
          <span className="text-[11px] font-semibold tracking-wide uppercase">Total</span>
          <span className="text-[15px] font-extrabold tabular-nums">AED {total}</span>
        </div>
      </div>
    </section>
  );
}

/** A numbered list such as terms or notes; lines are never split between pages. */
export function NumberedList({ label, items, s }: { label: string; items: string[]; s: DocStyle }) {
  return (
    <div>
      <div className="break-after-avoid">
        <Label>{label}</Label>
      </div>
      <ol className="mt-1.5 grid gap-0.5 text-[10.5px] leading-relaxed text-neutral-600">
        {items.map((t, n) => (
          <li key={n} className="flex gap-2 break-inside-avoid">
            <span className="font-semibold tabular-nums" style={{ color: s.accent }}>
              {n + 1}.
            </span>
            <span className="whitespace-pre-line">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The uploaded signature and company stamp, when the template shows them and they are uploaded (Letterhead). */
export function SignOff({ brand }: { brand: QuoteBrand }) {
  const s = styleOf(brand);
  if (!s.showSignature || !(brand.signatureSrc || brand.stampSrc)) return null;
  return (
    <section className="mt-6 flex justify-end break-inside-avoid">
      <div className="grid w-56 justify-items-center text-center text-[10.5px] text-neutral-600">
        <div className="text-[9.5px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">For {brand.company}</div>
        <div className="relative mt-1 flex h-20 w-full items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {brand.stampSrc && <img src={brand.stampSrc} alt="" className="absolute right-2 max-h-20 opacity-90" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {brand.signatureSrc && <img src={brand.signatureSrc} alt="Signature" className="relative max-h-16 max-w-40" />}
        </div>
        <div className="zx-rule w-full pt-1 font-semibold text-neutral-800">Authorised signatory</div>
      </div>
    </section>
  );
}

/** Columns of the lines table without the # column when the template hides item numbers. */
export const withNumbers = <T,>(s: DocStyle, head: T[]): T[] => (s.showNumbers ? head : head.slice(1));

export function DocFooter({ left, brand }: { left: React.ReactNode; brand: QuoteBrand }) {
  const s = styleOf(brand);
  return (
    <footer className="zx-rule mt-6 flex items-center justify-between gap-4 pt-2.5 text-[9.5px] text-neutral-500 break-inside-avoid">
      <span>{s.footerText || left}</span>
      <span>{[brand.company, brand.website].filter(Boolean).join("  ·  ")}</span>
    </footer>
  );
}
