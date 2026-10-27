"use client";

import { BookmarkPlus, Columns3, Minus, Plus, Rows3, TextQuote, Trash2 } from "lucide-react";
import Link from "next/link";
import { memo, useState } from "react";
import { toast } from "sonner";
import { PaymentTable, PriceTable, type PriceLine, priceTotals } from "@/components/proposal/price-tables";
import { BankTable, type CoverInfo, onDarkAccent, type ProposalBrand, QuoteHeader, SignatureBlock } from "@/components/proposal/proposal-document";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Block, type BlockOf, docText, type RichDoc, splitByPercent, STANDARD_TERMS } from "@/lib/proposal";
import { longDay, money } from "@/lib/quotation";
import { deleteTermsText, saveTermsText } from "../../../proposal-actions";
import { RichText } from "./rich-text";

/** What the blocks show besides their own data: the project, the customer and references, the BOQ and our brand. */
export interface ProposalContext {
  projectId: number;
  projectNumber: string;
  /** Customer, contact, site, quote number, date, valid until, TRN, bank: as the document prints them. */
  cover: CoverInfo;
  brand: ProposalBrand;
  boq: { lines: PriceLine[]; sections: string[]; vatPct: number };
  terms: { id: number | null; title: string; doc: RichDoc; mine: boolean }[];
  meId: number;
  isAdmin: boolean;
  /** The address typed on the cover (the quotation header repeats it). */
  customerAddress: string;
}

type Change<T extends Block["type"]> = (data: BlockOf<T>["data"]) => void;

// borderless inputs that look like the printed text until you click them
const bare = "w-full rounded-sm bg-transparent outline-none placeholder:text-neutral-400 hover:bg-neutral-50 focus:bg-neutral-50";
/** A one-line text that wraps when long (titles, headings): grows with its text, Enter does not add a line. */
function Line(props: Omit<React.ComponentProps<"textarea">, "onChange" | "rows"> & { onValue: (v: string) => void }) {
  const { onValue, className = "", ...rest } = props;
  return (
    <textarea
      rows={1}
      {...rest}
      className={`${bare} field-sizing-content resize-none overflow-hidden ${className}`}
      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      onChange={(e) => onValue(e.target.value.replace(/\s*\n\s*/g, " "))}
    />
  );
}

const small = "inline-flex h-7 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 hover:bg-neutral-50 [&_svg]:size-3.5";

// the dark cover's inputs: white text on navy
const onDark = "w-full rounded-sm bg-transparent text-white outline-none placeholder:text-neutral-500 hover:bg-white/5 focus:bg-white/10";

/** The cover as it prints (full page, solid dark), with the title, subtitle and customer address typed in place. */
function Cover({ b, onChange, ctx }: { b: BlockOf<"cover">; onChange: Change<"cover">; ctx: ProposalContext }) {
  const accent = onDarkAccent(ctx.brand.color);
  const c = ctx.cover;
  const label = "mb-1 text-[11px] tracking-wide text-neutral-300 uppercase";
  return (
    <div
      className="relative -mx-5 -mt-8 flex min-h-[56rem] flex-col overflow-hidden rounded-t-sm px-8 pt-10 pb-6 text-white sm:-mx-14 sm:-mt-12 sm:px-14"
      style={{ background: "#0f1b26" }}
    >
      {ctx.brand.logoDarkSrc || ctx.brand.logoSrc ? (
        // without a white logo, the normal one is turned white (as the print does)
        // eslint-disable-next-line @next/next/no-img-element -- our own logo endpoint
        <img src={ctx.brand.logoDarkSrc ?? ctx.brand.logoSrc ?? ""} alt={ctx.brand.company} className={`h-10 w-fit object-contain ${ctx.brand.logoDarkSrc ? "" : "brightness-0 invert"}`} />
      ) : (
        <div className="text-2xl font-bold tracking-wide">
          {ctx.brand.company}
          <span className="ml-2 align-middle text-[10px] font-normal text-neutral-300">(upload a white logo in Admin, Settings, Documents)</span>
        </div>
      )}
      <div className="flex-1" />
      <div className="grid gap-2">
        <Line aria-label="Proposal title" className={`${onDark} text-[34px] leading-tight font-semibold tracking-tight uppercase`} value={b.data.title} placeholder="PROPOSAL TITLE" onValue={(title) => onChange({ ...b.data, title })} />
        <div className="text-[22px] leading-tight font-semibold uppercase" style={{ color: accent }}>
          For {c.customer}
        </div>
        <div className="h-[3px] w-40" style={{ background: accent }} />
        <Line aria-label="Subtitle" className={`${onDark} mt-1 text-[14px] text-neutral-300`} value={b.data.subtitle} placeholder="One line on what the project is" onValue={(subtitle) => onChange({ ...b.data, subtitle })} />
      </div>
      <div className="flex-1" />
      <div className="grid gap-6 border-t border-white/15 pt-6 text-[13px]">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className={label}>Prepared for</div>
            <div className="text-[15px] font-semibold">{c.customer}</div>
            <textarea
              aria-label="Customer address"
              rows={2}
              className={`${onDark} field-sizing-content resize-none text-neutral-300`}
              placeholder="Customer address (building, office, area, emirate)"
              value={b.data.customerAddress}
              onChange={(e) => onChange({ ...b.data, customerAddress: e.target.value })}
            />
            {c.site && <div className="text-neutral-300">Project site: {c.site.split(/\r?\n/).join(", ")}</div>}
          </div>
          <div>
            <div className={label}>Prepared by</div>
            <div className="text-[15px] font-semibold">{ctx.brand.company}</div>
            {ctx.brand.address && <div className="text-neutral-300">{ctx.brand.address}</div>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className={label}>Reference</div>
            <div className="font-semibold">{c.quoteNumber ?? c.projectNumber}</div>
          </div>
          <div>
            <div className={label}>Date</div>
            <div className="font-semibold">{longDay(c.date)}</div>
          </div>
          <div>
            <div className={label}>Valid until</div>
            <div className="font-semibold">{c.validUntil ? longDay(c.validUntil) : "-"}</div>
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/15 pt-3 text-[11px] text-neutral-400">
        <div>
          {ctx.brand.address && <div>{ctx.brand.address}</div>}
          <div>{[ctx.brand.email, ctx.brand.phones || ctx.brand.mainPhone, ctx.brand.website].filter(Boolean).join("  |  ")}</div>
        </div>
        <span className="font-semibold tracking-wide text-white">CONFIDENTIAL</span>
      </div>
    </div>
  );
}

function Heading({ b, onChange, ctx, num }: { b: BlockOf<"heading">; onChange: Change<"heading">; ctx: ProposalContext; num?: number }) {
  return (
    <div className={`flex items-baseline gap-1.5 ${b.data.level === 1 ? "border-b pb-1" : ""}`} style={b.data.level === 1 ? { borderColor: ctx.brand.color, color: ctx.brand.color } : undefined}>
      {num != null && <span className="text-[17px] font-semibold tabular-nums">{num}.</span>}
      <Line
        aria-label="Heading"
        className={`font-semibold tracking-tight ${b.data.level === 1 ? "text-[17px]" : "text-base"}`}
        value={b.data.text}
        placeholder={b.data.level === 1 ? "Section heading" : "Sub-heading"}
        onValue={(text) => onChange({ ...b.data, text })}
      />
    </div>
  );
}

/** The quotation header exactly as it prints; only its big word ("Quotation", "Proposal") is typed here. */
function QuoteHeaderBlock({ b, onChange, ctx }: { b: BlockOf<"quote_header">; onChange: Change<"quote_header">; ctx: ProposalContext }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2 text-xs text-neutral-500 print:hidden">
        Title
        <input aria-label="Header title" className="h-6 w-40 rounded border border-neutral-200 px-1.5 text-xs" value={b.data.heading} onChange={(e) => onChange({ heading: e.target.value })} />
        <span>· our details come from Admin, Settings</span>
      </div>
      <QuoteHeader heading={b.data.heading} customerAddress={ctx.customerAddress} cover={ctx.cover} brand={ctx.brand} />
    </div>
  );
}

function Bank({ b, onChange, ctx }: { b: BlockOf<"bank">; onChange: Change<"bank">; ctx: ProposalContext }) {
  return (
    <div>
      <input aria-label="Title" className={`${bare} mb-1 text-[14px] font-semibold`} style={{ color: ctx.brand.color }} value={b.data.title} onChange={(e) => onChange({ title: e.target.value })} />
      {ctx.cover.bank ? (
        <BankTable bank={ctx.cover.bank} title="" accent={ctx.brand.color} />
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">No bank details yet. An admin adds them in Admin, Settings, Documents; until then this block does not print.</p>
      )}
    </div>
  );
}

function Text({ b, onChange, onSlash }: { b: BlockOf<"text">; onChange: Change<"text">; onSlash: () => void }) {
  return (
    <div className={b.data.style === "callout" ? "rounded-md border-l-4 border-neutral-400 bg-neutral-100 px-4 py-3" : ""}>
      <RichText value={b.data.doc} onChange={(doc) => onChange({ ...b.data, doc })} onSlash={onSlash} className="text-[14px] leading-relaxed" />
    </div>
  );
}

function Table({ b, onChange }: { b: BlockOf<"table">; onChange: Change<"table"> }) {
  const rows = b.data.rows;
  const cols = rows[0]?.length ?? 1;
  const set = (r: number, c: number, v: string) => onChange({ ...b.data, rows: rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div className="grid gap-2">
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={b.data.header && r === 0 ? "bg-[#e9efe9] font-semibold" : ""}>
              {row.map((cell, c) => (
                <td key={c} className={`border border-neutral-300 p-0 align-top ${b.data.style === "spec" && c === 0 && !(b.data.header && r === 0) ? "w-[30%] font-semibold" : ""}`}>
                  <textarea
                    aria-label={`Row ${r + 1}, column ${c + 1}`}
                    rows={1}
                    className={`${bare} field-sizing-content resize-none px-2 py-1.5`}
                    value={cell}
                    onChange={(e) => set(r, c, e.target.value)}
                  />
                </td>
              ))}
              <td className="w-7 p-0 print:hidden">
                <button type="button" aria-label="Remove this row" title="Remove this row" disabled={rows.length <= 1} className="p-1 text-neutral-400 hover:text-red-600 disabled:opacity-30" onClick={() => onChange({ ...b.data, rows: rows.filter((_, i) => i !== r) })}>
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-1.5 print:hidden">
        <button type="button" className={small} disabled={rows.length >= 100} onClick={() => onChange({ ...b.data, rows: [...rows, Array(cols).fill("")] })}>
          <Rows3 /> Add row
        </button>
        <button type="button" className={small} disabled={cols >= 8} onClick={() => onChange({ ...b.data, rows: rows.map((row) => [...row, ""]) })}>
          <Columns3 /> Add column
        </button>
        <button type="button" className={small} disabled={cols <= 1} onClick={() => onChange({ ...b.data, rows: rows.map((row) => row.slice(0, -1)) })}>
          <Minus /> Last column
        </button>
        <label className={small}>
          <input type="checkbox" checked={b.data.header} onChange={(e) => onChange({ ...b.data, header: e.target.checked })} /> First row is a header
        </label>
        <label className={small} title="The first column is a bold label, like the proposed solution table">
          <input type="checkbox" checked={b.data.style === "spec"} onChange={(e) => onChange({ ...b.data, style: e.target.checked ? "spec" : "grid" })} /> Label / value rows
        </label>
      </div>
    </div>
  );
}

function TitleInput({ value, onChange, color }: { value: string; onChange: (v: string) => void; color: string }) {
  return <input aria-label="Title" className={`${bare} mb-2 text-base font-semibold`} style={{ color }} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function Pricing({ b, onChange, ctx }: { b: BlockOf<"pricing">; onChange: Change<"pricing">; ctx: ProposalContext }) {
  return (
    <div>
      <TitleInput value={b.data.title} color={ctx.brand.color} onChange={(title) => onChange({ ...b.data, title })} />
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs print:hidden">
        <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5" role="radiogroup" aria-label="How to show the price">
          {(
            [
              ["items", "Every item"],
              ["sections", "Section totals"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={b.data.display === k}
              onClick={() => onChange({ ...b.data, display: k })}
              className={`rounded px-2 py-1 ${b.data.display === k ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-600"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-neutral-700">
          <input type="checkbox" checked={b.data.showOptional} onChange={(e) => onChange({ ...b.data, showOptional: e.target.checked })} /> Show optional extras
        </label>
        <Link href={`/projects/list/${ctx.projectId}?tab=boq`} className="ml-auto text-neutral-500 underline hover:text-neutral-900">
          Change the prices in the BOQ
        </Link>
      </div>
      <PriceTable lines={ctx.boq.lines} sections={ctx.boq.sections} vatPct={ctx.boq.vatPct} display={b.data.display} showOptional={b.data.showOptional} accent={ctx.brand.color} />
    </div>
  );
}

function Payment({ b, onChange, ctx }: { b: BlockOf<"payment">; onChange: Change<"payment">; ctx: ProposalContext }) {
  const total = priceTotals(ctx.boq.lines, ctx.boq.vatPct).total;
  const sum = b.data.rows.reduce((s, r) => s + r.percent, 0);
  const amounts = splitByPercent(total, b.data.rows.map((r) => r.percent));
  const setRow = (i: number, over: Partial<{ label: string; percent: number }>) => onChange({ ...b.data, rows: b.data.rows.map((r, j) => (j === i ? { ...r, ...over } : r)) });
  return (
    <div>
      <TitleInput value={b.data.title} color={ctx.brand.color} onChange={(title) => onChange({ ...b.data, title })} />
      <div className="print:hidden">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 bg-neutral-100 text-left text-[11px] tracking-wide text-neutral-600 uppercase" style={{ borderColor: ctx.brand.color }}>
              <th className="px-2 py-1.5 font-medium">Payment</th>
              <th className="w-24 px-2 py-1.5 text-right font-medium">Share %</th>
              <th className="w-36 px-2 py-1.5 text-right font-medium">Amount incl. VAT</th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody>
            {b.data.rows.map((r, i) => (
              <tr key={i} className="border-b border-neutral-200">
                <td className="p-0">
                  <input aria-label="Payment" className={`${bare} px-2 py-1.5`} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />
                </td>
                <td className="p-0">
                  <input
                    aria-label="Share in percent"
                    inputMode="decimal"
                    className={`${bare} px-2 py-1.5 text-right tabular-nums`}
                    value={String(r.percent)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value.trim() === "" || (Number.isFinite(n) && n >= 0 && n <= 100)) setRow(i, { percent: e.target.value.trim() === "" ? 0 : n });
                    }}
                  />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(amounts[i])}</td>
                <td className="p-0">
                  <button type="button" aria-label="Remove this payment" title="Remove" className="p-1 text-neutral-400 hover:text-red-600" onClick={() => onChange({ ...b.data, rows: b.data.rows.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" className={small} disabled={b.data.rows.length >= 12} onClick={() => onChange({ ...b.data, rows: [...b.data.rows, { label: "", percent: 0 }] })}>
            <Plus /> Add payment
          </button>
          {Math.abs(sum - 100) > 1e-9 ? (
            <span className="font-medium text-amber-700">The shares add up to {sum}%, not 100%.</span>
          ) : (
            <span className="text-neutral-500">Adds up to 100% of {money(total)}.</span>
          )}
        </div>
      </div>
      <div className="hidden print:block">
        <PaymentTable rows={b.data.rows} total={total} accent={ctx.brand.color} />
      </div>
    </div>
  );
}

function Timeline({ b, onChange, ctx }: { b: BlockOf<"timeline">; onChange: Change<"timeline"> ; ctx: ProposalContext }) {
  const setRow = (i: number, over: Partial<{ phase: string; duration: string }>) => onChange({ ...b.data, rows: b.data.rows.map((r, j) => (j === i ? { ...r, ...over } : r)) });
  return (
    <div>
      <TitleInput value={b.data.title} color={ctx.brand.color} onChange={(title) => onChange({ ...b.data, title })} />
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {b.data.rows.map((r, i) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className="w-8 px-2 py-1.5 align-top text-neutral-500">{i + 1}</td>
              <td className="p-0">
                <input aria-label="Phase" placeholder="Phase" className={`${bare} px-2 py-1.5`} value={r.phase} onChange={(e) => setRow(i, { phase: e.target.value })} />
              </td>
              <td className="w-64 p-0">
                <input aria-label="How long" placeholder="How long / when" className={`${bare} px-2 py-1.5 text-right`} value={r.duration} onChange={(e) => setRow(i, { duration: e.target.value })} />
              </td>
              <td className="w-7 p-0 print:hidden">
                <button type="button" aria-label="Remove this phase" title="Remove" className="p-1 text-neutral-400 hover:text-red-600" onClick={() => onChange({ ...b.data, rows: b.data.rows.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className={`${small} mt-2 print:hidden`} disabled={b.data.rows.length >= 30} onClick={() => onChange({ ...b.data, rows: [...b.data.rows, { phase: "", duration: "" }] })}>
        <Plus /> Add phase
      </button>
    </div>
  );
}

function Terms({ b, onChange, ctx }: { b: BlockOf<"terms">; onChange: Change<"terms">; ctx: ProposalContext }) {
  // bumping the key remounts the text editor with new content (it only reads its value once)
  const [rev, setRev] = useState(0);
  const insert = (t: { title: string; doc: RichDoc }) => {
    if (docText(b.data.doc) && !confirm(`Replace this text with "${t.title}"?`)) return;
    onChange({ title: t.title, doc: structuredClone(t.doc) });
    setRev((n) => n + 1);
  };
  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TitleInput value={b.data.title} color={ctx.brand.color} onChange={(title) => onChange({ ...b.data, title })} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={`${small} print:hidden`} />}>
            <TextQuote /> Standard text
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Insert</DropdownMenuLabel>
              {STANDARD_TERMS.map((t) => (
                <DropdownMenuItem key={t.key} onClick={() => insert(t)}>
                  {t.title}
                </DropdownMenuItem>
              ))}
              {ctx.terms.map((t) => (
                <DropdownMenuItem key={`lib-${t.id}`} onClick={() => insert(t)}>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.id != null && (t.mine || ctx.isAdmin) && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove "${t.title}" from the library`}
                      title="Remove from the library"
                      className="text-neutral-400 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm(`Remove "${t.title}" from the library?`)) return;
                        deleteTermsText(t.id!).then(
                          () => toast.success("Removed from the library"),
                          (err: Error) => toast.error(err.message),
                        );
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                saveTermsText({ title: b.data.title, doc: b.data.doc }).then(
                  () => toast.success(`"${b.data.title}" saved to the library. Other proposals offer it from now on.`),
                  (err: Error) => toast.error(err.message),
                )
              }
            >
              <BookmarkPlus /> Save this text to the library
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <RichText key={rev} value={b.data.doc} onChange={(doc) => onChange({ ...b.data, doc })} className="text-[13px] leading-relaxed" />
    </div>
  );
}

function Signature({ b, onChange, ctx }: { b: BlockOf<"signature">; onChange: Change<"signature">; ctx: ProposalContext }) {
  const missing = [!ctx.brand.signatureSrc && "signature", !ctx.brand.stampSrc && "stamp"].filter(Boolean);
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-16 print:hidden">
        <input aria-label="Our label" className={`${bare} text-[12.5px]`} value={b.data.ourLabel} onChange={(e) => onChange({ ...b.data, ourLabel: e.target.value })} />
        <input aria-label="Customer label" className={`${bare} text-[12.5px]`} value={b.data.customerLabel} onChange={(e) => onChange({ ...b.data, customerLabel: e.target.value })} />
      </div>
      <div className="-mt-8">
        <SignatureBlock ourLabel={b.data.ourLabel} customerLabel={b.data.customerLabel} note="" brand={ctx.brand} />
      </div>
      <input aria-label="Note under the signatures" placeholder="A note under the signatures (optional)" className={`${bare} text-[12px] text-neutral-600`} value={b.data.note} onChange={(e) => onChange({ ...b.data, note: e.target.value })} />
      {missing.length > 0 && <p className="text-xs text-amber-700 print:hidden">No {missing.join(" or ")} image yet: an admin uploads them in Admin, Settings, Documents.</p>}
    </div>
  );
}

/** One block's content on the page. Memoised: typing in one block does not redraw the others. */
export const BlockBody = memo(function BlockBody({ block, onChange, ctx, onSlash, num }: { block: Block; onChange: (b: Block) => void; ctx: ProposalContext; onSlash: () => void; num?: number }) {
  const set = <T extends Block["type"]>(data: BlockOf<T>["data"]) => onChange({ ...block, data } as Block);
  switch (block.type) {
    case "cover":
      return <Cover b={block} onChange={set} ctx={ctx} />;
    case "quote_header":
      return <QuoteHeaderBlock b={block} onChange={set} ctx={ctx} />;
    case "bank":
      return <Bank b={block} onChange={set} ctx={ctx} />;
    case "heading":
      return <Heading b={block} onChange={set} ctx={ctx} num={num} />;
    case "text":
      return <Text b={block} onChange={set} onSlash={onSlash} />;
    case "table":
      return <Table b={block} onChange={set} />;
    case "pricing":
      return <Pricing b={block} onChange={set} ctx={ctx} />;
    case "payment":
      return <Payment b={block} onChange={set} ctx={ctx} />;
    case "timeline":
      return <Timeline b={block} onChange={set} ctx={ctx} />;
    case "terms":
      return <Terms b={block} onChange={set} ctx={ctx} />;
    case "signature":
      return <Signature b={block} onChange={set} ctx={ctx} />;
    case "divider":
      return <hr className="my-2 border-neutral-300" />;
    case "page_break":
      return (
        <div className="flex items-center gap-2 py-1 text-[11px] font-medium tracking-wide text-neutral-400 uppercase print:hidden">
          <span className="h-px flex-1 border-t border-dashed border-neutral-300" /> Page break <span className="h-px flex-1 border-t border-dashed border-neutral-300" />
        </div>
      );
  }
});
