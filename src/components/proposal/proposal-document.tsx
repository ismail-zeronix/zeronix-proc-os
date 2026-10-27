import type { QuoteBrand } from "@/components/quote-document";
import { type Block, headingNumbers } from "@/lib/proposal";
import { longDay } from "@/lib/quotation";
import { PaymentTable, type PriceLine, PriceTable, priceTotals } from "./price-tables";
import { RichRender } from "./rich-render";

/** Our company details as customer documents print them: the email brand plus the document lines and images. */
export type ProposalBrand = QuoteBrand & {
  email: string;
  phones: string;
  tradeLicense: string;
  /** White logo for the dark cover. */
  logoDarkSrc: string | null;
  signatureSrc: string | null;
  stampSrc: string | null;
};

export interface BankDetails {
  bank: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
}

/** What the document shows about the customer and the references, fixed when a quote is made. */
export interface CoverInfo {
  customer: string;
  contact: string;
  contactTitle: string;
  site: string;
  projectNumber: string;
  quoteNumber: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD; older snapshots have none. */
  validUntil?: string | null;
  customerTrn?: string;
  bank?: BankDetails | null;
}

const NAVY = "#0f1b26";
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#1f7a3f");
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** "For Zeronix Technology LLC": the company name in bold, as on Zeronix's own proposals. */
function ForLabel({ text }: { text: string }) {
  const m = /^(for|accepted by the)\s+(.+)$/i.exec(text.trim());
  if (!m) return <span className="font-semibold">{text}</span>;
  return (
    <>
      {text.slice(0, text.length - m[2].length)}
      <span className="font-bold">{m[2]}</span>
    </>
  );
}

/** A brighter version of the brand colour for text on the dark cover (a deep green reads poorly on navy or a photo). */
export function onDarkAccent(hex: string, amount = 0.35): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const mix = (c: string) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount).toString(16).padStart(2, "0");
  return `#${mix(m[1])}${mix(m[2])}${mix(m[3])}`;
}

export function Cover({
  title,
  subtitle,
  customerAddress,
  cover,
  brand,
}: {
  title: string;
  subtitle: string;
  customerAddress: string;
  cover: CoverInfo;
  brand: ProposalBrand;
}) {
  const accent = onDarkAccent(safeColor(brand.color));
  const contactLine = [brand.email, brand.phones || brand.mainPhone, brand.website].filter(Boolean).join("  |  ");
  return (
    <section
      data-pdf-cover
      className="relative flex min-h-[297mm] flex-col overflow-hidden px-[17mm] pt-[20mm] pb-[14mm] text-white print:h-[297mm] print:min-h-0 print:break-after-page"
      style={{ background: NAVY, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <div>
        {brand.logoDarkSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own logo endpoint; next/image does not help in print
          <img src={brand.logoDarkSrc} alt={brand.company} className="h-[11mm] w-auto object-contain" />
        ) : brand.logoSrc ? (
          // no white logo uploaded yet: the normal logo turned white reads well enough on the navy
          // eslint-disable-next-line @next/next/no-img-element -- our own logo endpoint
          <img src={brand.logoSrc} alt={brand.company} className="h-[11mm] w-auto object-contain brightness-0 invert" />
        ) : (
          <div className="text-[26px] font-bold tracking-wide">{brand.company}</div>
        )}
      </div>
      <div className="flex-1" />
      <div className="grid gap-3">
        <h1 className="text-[40px] leading-[1.12] font-semibold tracking-tight uppercase">{title}</h1>
        <div className="text-[25px] leading-tight font-semibold uppercase" style={{ color: accent }}>
          For {cover.customer}
        </div>
        <div className="mt-1 h-[3px] w-[48mm]" style={{ background: accent }} />
        {subtitle && <p className="mt-2 text-[14px] text-neutral-300">{subtitle}</p>}
      </div>
      <div className="flex-1" />
      <div className="grid gap-7 border-t border-white/15 pt-7 text-[13px]">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-neutral-400 uppercase">Prepared for</div>
            <div className="text-[15px] font-semibold">{cover.customer}</div>
            {lines(customerAddress).map((l, i) => (
              <div key={i} className="text-neutral-300">
                {l}
              </div>
            ))}
            {cover.site && <div className="text-neutral-300">Project site: {lines(cover.site).join(", ")}</div>}
          </div>
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-neutral-400 uppercase">Prepared by</div>
            <div className="text-[15px] font-semibold">{brand.company}</div>
            {brand.address && <div className="text-neutral-300">{brand.address}</div>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-8">
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-neutral-400 uppercase">Reference</div>
            <div className="font-semibold">{cover.quoteNumber ?? cover.projectNumber}</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] tracking-wide text-neutral-400 uppercase">Date</div>
            <div className="font-semibold">{longDay(cover.date)}</div>
          </div>
          {cover.validUntil && (
            <div>
              <div className="mb-1 text-[11px] tracking-wide text-neutral-400 uppercase">Valid until</div>
              <div className="font-semibold">{longDay(cover.validUntil)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-8 flex items-end justify-between gap-6 border-t border-white/15 pt-4 text-[11px] text-neutral-400">
        <div>
          {brand.address && <div>{brand.address}</div>}
          {contactLine && <div>{contactLine}</div>}
        </div>
        <div className="font-semibold tracking-wide text-white">CONFIDENTIAL</div>
      </div>
    </section>
  );
}

export function QuoteHeader({ heading, customerAddress, cover, brand }: { heading: string; customerAddress: string; cover: CoverInfo; brand: ProposalBrand }) {
  const accent = safeColor(brand.color);
  const meta: [string, string][] = [
    ["Quotation No.", cover.quoteNumber ?? "Draft"],
    ["Date", longDay(cover.date)],
    ...(cover.validUntil ? ([["Valid Until", longDay(cover.validUntil)]] as [string, string][]) : []),
    ["Currency", "AED"],
    ["Project", cover.projectNumber],
  ];
  return (
    <section className="mb-6 break-inside-avoid">
      <div className="flex items-start justify-between gap-6 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div className="text-[12px] leading-snug text-neutral-700">
          {brand.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own logo endpoint
            <img src={brand.logoSrc} alt={brand.company} className="mb-3 h-[10mm] w-auto object-contain" />
          ) : (
            <div className="mb-2 text-xl font-bold" style={{ color: accent }}>
              {brand.company}
            </div>
          )}
          <div className="text-[13px] font-semibold text-neutral-900">{brand.company}</div>
          {brand.address && <div className="max-w-[70mm] whitespace-pre-line">{brand.address}</div>}
          {(brand.phones || brand.mainPhone) && <div>Tel: {brand.phones || brand.mainPhone}</div>}
          {brand.email && <div>Email: {brand.email}</div>}
          {brand.website && <div>Web: {brand.website}</div>}
          {brand.trn && <div>TRN: {brand.trn}</div>}
        </div>
        <div className="min-w-[62mm] text-right">
          <div className="mb-3 text-[30px] leading-none font-bold tracking-tight uppercase" style={{ color: accent }}>
            {heading || "Quotation"}
          </div>
          <dl className="grid grid-cols-[auto_auto] justify-end gap-x-6 gap-y-0.5 text-[12px]">
            {meta.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-left text-neutral-600">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-8 text-[12.5px] leading-snug">
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-neutral-500 uppercase">{heading ? `${heading} for` : "Quotation for"}</div>
          <div className="text-[14px] font-semibold">{cover.customer}</div>
          {lines(customerAddress).map((l, i) => (
            <div key={i} className="text-neutral-700">
              {l}
            </div>
          ))}
          {cover.site && <div className="text-neutral-700">Project site: {lines(cover.site).join(", ")}</div>}
          {cover.contact && (
            <div className="text-neutral-700">
              Attn: {cover.contact}
              {cover.contactTitle ? `, ${cover.contactTitle}` : ""}
            </div>
          )}
          {cover.customerTrn && <div className="text-neutral-700">TRN: {cover.customerTrn}</div>}
        </div>
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-neutral-500 uppercase">Prepared by</div>
          <div className="text-[14px] font-semibold">{brand.company}</div>
          {brand.tagline && <div className="text-neutral-700">{brand.tagline}</div>}
        </div>
      </div>
    </section>
  );
}

export function BankTable({ bank, title, accent }: { bank: BankDetails | null | undefined; title: string; accent: string }) {
  const rows = bank
    ? ([
        ["Bank", bank.bank],
        ["Account name", bank.accountName],
        ["Account number", bank.accountNumber],
        ["IBAN", bank.iban],
        ["SWIFT", bank.swift],
      ].filter(([, v]) => v) as [string, string][])
    : [];
  if (!rows.length) return null;
  return (
    <section className="my-4 break-inside-avoid">
      {title && (
        <h3 className="mb-2 text-[14px] font-semibold" style={{ color: accent }}>
          {title}
        </h3>
      )}
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="w-[38%] border border-neutral-300 bg-neutral-50 px-2.5 py-1.5 font-semibold">{k}</td>
              <td className="border border-neutral-300 px-2.5 py-1.5 font-mono tracking-tight">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SignatureBlock({ ourLabel, customerLabel, note, brand }: { ourLabel: string; customerLabel: string; note: string; brand: ProposalBrand }) {
  return (
    <section className="mt-8 grid gap-3 break-inside-avoid text-[12.5px]">
      <div className="grid grid-cols-2 gap-16">
        <div>
          <div className="mb-2">
            <ForLabel text={ourLabel} />
          </div>
          <div className="flex h-[28mm] items-end gap-3 border-b border-neutral-800 pb-1">
            {brand.signatureSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- our own signature image
              <img src={brand.signatureSrc} alt="Signature" className="max-h-[22mm] max-w-[42mm] object-contain" />
            )}
            {brand.stampSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- our own stamp image
              <img src={brand.stampSrc} alt="Company stamp" className="max-h-[26mm] max-w-[26mm] object-contain" />
            )}
          </div>
          <div className="mt-1 text-neutral-600">Authorised Signatory and Stamp</div>
        </div>
        <div>
          <div className="mb-2">
            <ForLabel text={customerLabel} />
          </div>
          <div className="h-[28mm] border-b border-neutral-800" />
          <div className="mt-1 text-neutral-600">Name, Signature, Stamp and Date</div>
        </div>
      </div>
      {note && <p className="text-[12px] text-neutral-600">{note}</p>}
    </section>
  );
}

/**
 * The proposal as the customer receives it, laid out like Zeronix's own: a dark full-page cover, then white A4 pages
 * with numbered sections. The cover and the body are marked (data-pdf-cover / data-pdf-body) so the PDF can print the
 * cover without margins and number the pages from the first inside page. No hooks: it renders on the server.
 */
export function ProposalDocument({ blocks, cover, boq, brand }: { blocks: Block[]; cover: CoverInfo; boq: { lines: PriceLine[]; sections: string[]; vatPct: number }; brand: ProposalBrand }) {
  const accent = safeColor(brand.color);
  const total = priceTotals(boq.lines, boq.vatPct).total;
  const numbers = headingNumbers(blocks);
  const coverBlock = blocks[0]?.type === "cover" ? blocks[0] : null;
  const customerAddress = (blocks.find((b) => b.type === "cover") as Extract<Block, { type: "cover" }> | undefined)?.data.customerAddress ?? "";
  const body = coverBlock ? blocks.slice(1) : blocks;
  const title = (t: string) =>
    t.trim() ? (
      <h3 className="mb-2 text-[14px] font-semibold break-after-avoid" style={{ color: accent }}>
        {t}
      </h3>
    ) : null;

  return (
    <article className="bg-white text-[12.5px] leading-relaxed text-neutral-900" aria-label="Proposal">
      {coverBlock && (
        <Cover
          title={coverBlock.data.title}
          subtitle={coverBlock.data.subtitle}
          customerAddress={coverBlock.data.customerAddress}
          cover={cover}
          brand={brand}
        />
      )}
      <div data-pdf-body className="px-[14mm] py-[12mm] print:p-0">
        {body.map((b) => {
          switch (b.type) {
            case "cover":
              // a second cover in the middle of a document reads as a title band
              return (
                <div key={b.id} className="my-4 rounded px-6 py-5 text-white" style={{ background: NAVY, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                  <div className="text-xl font-semibold uppercase">{b.data.title}</div>
                  {b.data.subtitle && <div className="text-neutral-300">{b.data.subtitle}</div>}
                </div>
              );
            case "quote_header":
              return <QuoteHeader key={b.id} heading={b.data.heading} customerAddress={customerAddress} cover={cover} brand={brand} />;
            case "heading":
              return b.data.level === 1 ? (
                <h2 key={b.id} className="mt-6 mb-2.5 border-b pb-1 text-[16px] font-semibold break-after-avoid first:mt-0" style={{ borderColor: accent, color: accent }}>
                  {numbers.has(b.id) ? `${numbers.get(b.id)}. ` : ""}
                  {b.data.text}
                </h2>
              ) : (
                <h3 key={b.id} className="mt-4 mb-2 text-[14px] font-semibold break-after-avoid">
                  {b.data.text}
                </h3>
              );
            case "text":
              return b.data.style === "callout" ? (
                <div key={b.id} className="my-3 rounded-md border-l-4 bg-neutral-100 px-4 py-3 break-inside-avoid" style={{ borderColor: accent }}>
                  <RichRender doc={b.data.doc} />
                </div>
              ) : (
                <RichRender key={b.id} doc={b.data.doc} className="my-2" />
              );
            case "table":
              return (
                <table key={b.id} className="my-3 w-full border-collapse text-[12.5px]">
                  <tbody>
                    {b.data.rows.map((row, r) => (
                      <tr key={r} className="break-inside-avoid">
                        {row.map((c, ci) => (
                          <td
                            key={ci}
                            className={`border border-neutral-300 px-2.5 py-1.5 align-top whitespace-pre-line ${
                              b.data.header && r === 0 ? "bg-[#e9efe9] font-semibold" : b.data.style === "spec" && ci === 0 ? "w-[30%] font-semibold" : ""
                            }`}
                          >
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            case "pricing":
              return (
                <section key={b.id} className="my-3">
                  {title(b.data.title)}
                  <PriceTable lines={boq.lines} sections={boq.sections} vatPct={boq.vatPct} display={b.data.display} showOptional={b.data.showOptional} accent={accent} />
                </section>
              );
            case "payment":
              return (
                <section key={b.id} className="my-4 break-inside-avoid">
                  {title(b.data.title)}
                  <PaymentTable rows={b.data.rows} total={total} />
                </section>
              );
            case "bank":
              return <BankTable key={b.id} bank={cover.bank} title={b.data.title} accent={accent} />;
            case "timeline":
              return (
                <section key={b.id} className="my-4 break-inside-avoid">
                  {title(b.data.title)}
                  <table className="w-full border-collapse text-[12.5px]">
                    <tbody>
                      {b.data.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="w-10 border border-neutral-300 px-2.5 py-1.5 text-center">{i + 1}</td>
                          <td className="border border-neutral-300 px-2.5 py-1.5">{r.phase}</td>
                          <td className="w-[38%] border border-neutral-300 px-2.5 py-1.5">{r.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            case "terms":
              return (
                <section key={b.id} className="my-4">
                  {title(b.data.title)}
                  <RichRender doc={b.data.doc} />
                </section>
              );
            case "signature":
              return <SignatureBlock key={b.id} ourLabel={b.data.ourLabel} customerLabel={b.data.customerLabel} note={b.data.note} brand={brand} />;
            case "divider":
              return <hr key={b.id} className="my-4 border-neutral-300" />;
            case "page_break":
              return <div key={b.id} className="break-after-page" aria-hidden />;
          }
        })}
      </div>
    </article>
  );
}
