"use client";

import { ArrowDown, ArrowUp, CircleCheck, Ellipsis, FilePlus2, FolderPlus, Pencil, Percent, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { amount } from "@/components/proposal/price-tables";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { boqMargin, boqMoney, boqPrice, defaultUnit, groupBoq, LINE_TYPES, NO_SECTION, UNITS } from "@/lib/boq";
import { dayLabel } from "@/lib/dates";
import type { BoqLineRow } from "@/lib/projects-data";
import { lineTotal, round2 } from "@/lib/quotation";
import type { QuoteSummary } from "@/lib/quotes-data";
import { createQuote, reviseQuote } from "../../../sales/quote-actions";
import { FindPrice } from "../../../sales/deals/[id]/find-price";
import {
  addBoqLine,
  addBoqLineFromOffer,
  addBoqSection,
  applySectionMargin,
  type BoqLineInput,
  deleteBoqLine,
  deleteBoqSection,
  moveBoqLine,
  moveBoqSection,
  renameBoqSection,
  updateBoqLine,
} from "../../boq-actions";

// item | kind | qty | unit | cost | margin | price | total | actions
const COLS = "grid-cols-4 lg:grid-cols-[minmax(0,1fr)_6.5rem_3.5rem_4.75rem_5.5rem_4.25rem_6rem_6.5rem_5.25rem]";

const parse = (s: string): number | null => {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const show = (n: number | null | undefined) => (n == null ? "" : String(n));
/** Always two decimals, as on the proposal and the quote: AED 9,340.40, not AED 9,340.4. */
const money = (n: number) => `AED ${amount(n)}`;

/**
 * Saves still on their way to the server. "Make quote" waits for them, so a line typed a moment before the click is in
 * the quote and its PDF.
 */
const inflight = new Set<Promise<unknown>>();
const settled = () => Promise.allSettled([...inflight]);

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        after?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

type LineValues = Omit<BoqLineInput, "section">;
const sameValues = (a: LineValues, b: LineValues) =>
  a.description.trim() === b.description.trim() &&
  a.lineType === b.lineType &&
  a.unit === b.unit &&
  a.qty === b.qty &&
  a.costAed === b.costAed &&
  (a.marginPct ?? null) === (b.marginPct ?? null) &&
  a.unitPriceAed === b.unitPriceAed &&
  a.optional === b.optional;
const valuesOf = (l: BoqLineRow): LineValues => ({
  description: l.description,
  lineType: l.lineType,
  unit: l.unit,
  qty: l.qty,
  costAed: l.costAed,
  marginPct: l.marginPct,
  unitPriceAed: l.unitPriceAed,
  optional: l.optional,
});

/**
 * One BOQ line, edited like a spreadsheet row. The row saves when you leave it (Tab or click out of the last box), so
 * typing qty, cost and margin one after the other is one save. The kind, unit and "optional" switch save at once. Saves
 * of a row run one after another, never at the same time, so a later change is never lost under an earlier one. On the
 * empty row at the bottom of a section, leaving the row with a description adds the line (as do Enter and +).
 * Cost and margin fix the price (price = cost plus margin on cost, to the fil); typing a price works out the margin.
 */
function Line({
  projectId,
  section,
  line,
  defaultMargin,
  first,
  last,
}: {
  projectId: number;
  section: string;
  line?: BoqLineRow;
  defaultMargin: number;
  first?: boolean;
  last?: boolean;
}) {
  const [desc, setDesc] = useState(line?.description ?? "");
  const [type, setType] = useState(line?.lineType ?? "material");
  const [unit, setUnit] = useState(line?.unit ?? "nos");
  const [qty, setQty] = useState(String(line?.qty ?? 1));
  const [cost, setCost] = useState(show(line?.costAed));
  const [margin, setMargin] = useState(show(line?.marginPct));
  const [price, setPrice] = useState(show(line?.unitPriceAed));
  const [optional, setOptional] = useState(line?.optional ?? false);
  const [saving, setSaving] = useState(false);
  const [pending, run] = useRun();
  const rowRef = useRef<HTMLDivElement>(null);

  const q = Math.max(1, Math.round(parse(qty) ?? 1));
  const c = parse(cost);
  const p = parse(price) ?? 0;
  const m = parse(margin);

  const values: LineValues = { description: desc, lineType: type, unit, qty: q, costAed: c, marginPct: c != null ? m : null, unitPriceAed: p, optional };
  // the latest typed values, for a save that starts after the one before it has finished
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  });
  // what the server has: compared against, so leaving a row you did not change saves nothing
  const saved = useRef<LineValues | null>(line ? valuesOf(line) : null);
  const chain = useRef<Promise<unknown> | null>(null);
  const again = useRef<Partial<LineValues> | null>(null);

  const fromServer = line ? JSON.stringify(valuesOf(line)) : "";
  // the server changed the line (a section margin, another tab, a refresh): show it, unless the person is typing in it
  useEffect(() => {
    if (!line) return;
    const s = valuesOf(line);
    saved.current = s;
    if (chain.current || rowRef.current?.contains(document.activeElement)) return;
    setDesc(s.description);
    setType(s.lineType);
    setUnit(s.unit);
    setQty(String(s.qty));
    setCost(show(s.costAed));
    setMargin(show(s.marginPct));
    setPrice(show(s.unitPriceAed));
    setOptional(s.optional);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fromServer stands for the line's values
  }, [fromServer]);

  const persist = (over: Partial<LineValues> = {}) => {
    if (!line) return;
    if (chain.current) {
      again.current = { ...again.current, ...over };
      return;
    }
    const job = (async () => {
      let next: Partial<LineValues> | null = over;
      setSaving(true);
      try {
        while (next) {
          const v = { ...latest.current, ...next };
          next = null;
          if (!v.description.trim()) {
            toast.error("The line needs a description.");
            break;
          }
          if (!saved.current || !sameValues(v, saved.current)) {
            await updateBoqLine(line.id, { ...v, section });
            saved.current = v;
          }
          // changes made while that save was on its way go in the next one
          if (again.current) {
            next = again.current;
            again.current = null;
          }
        }
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
    chain.current = job;
    inflight.add(job);
    void job.finally(() => {
      chain.current = null;
      inflight.delete(job);
      setSaving(false);
    });
  };

  const reset = () => {
    setDesc("");
    setQty("1");
    setCost("");
    setMargin("");
    setPrice("");
    setOptional(false);
  };
  const add = () => {
    if (!desc.trim() || pending) return;
    const v = latest.current;
    run(async () => {
      const job = addBoqLine(projectId, { ...v, section });
      inflight.add(job);
      try {
        await job;
      } finally {
        inflight.delete(job);
      }
      reset();
    });
  };

  const onCost = (v: string) => {
    setCost(v);
    const nc = parse(v);
    const mm = m ?? (nc != null ? defaultMargin : null);
    if (nc != null && mm != null) {
      setMargin(String(mm));
      setPrice(String(boqPrice(nc, mm)));
    }
  };
  const onMargin = (v: string) => {
    setMargin(v);
    const mm = parse(v);
    if (c != null && mm != null) setPrice(String(boqPrice(c, mm)));
  };
  const onPrice = (v: string) => {
    setPrice(v);
    const np = parse(v);
    const mm = np != null ? boqMargin(c, np) : null;
    if (mm != null) setMargin(String(mm));
  };

  // leaving the row (focus goes somewhere outside it) saves an existing line, or adds a typed new one
  const onRowBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (rowRef.current?.contains(e.relatedTarget as Node | null)) return;
    if (line) persist();
    else if (desc.trim()) add();
  };
  // selects and the optional switch save straight away on an existing line
  const saveNow = (over: Partial<LineValues>) => {
    if (line) persist(over);
  };
  // a click or Tab into a number box selects it, so typing replaces the number instead of adding to it
  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();

  const field = "h-8 px-2 text-right text-sm tabular-nums";
  const label = "text-[11px] text-muted-foreground lg:sr-only";
  const total = lineTotal({ qty: q, unitPrice: p });
  const shownTotal = line || desc.trim() ? money(total) : "";
  return (
    <div ref={rowRef} onBlur={onRowBlur} className={`grid ${COLS} items-end gap-x-2 gap-y-1 border-b py-1.5 lg:items-center ${optional ? "bg-muted/30" : ""}`}>
      <div className="col-span-4 lg:col-span-1">
        <Input
          aria-label="Line description"
          placeholder={line ? undefined : section ? `Add a line to ${section}` : "Add a line"}
          className="h-8 text-sm"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (!line && e.key === "Enter" && desc.trim()) add();
          }}
        />
        {(line?.supplierName || optional || (!line && desc.trim())) && (
          <div className="mt-0.5 px-1 text-[11px] text-muted-foreground">
            {optional && <span className="mr-2 font-medium text-amber-700 dark:text-amber-400">Optional extra, not in the total</span>}
            {line?.supplierName && `from ${line.supplierName}`}
            {!line && desc.trim() && "Not saved yet: press Enter, + or move to another row to add it"}
          </div>
        )}
      </div>
      <label className="col-span-2 grid gap-0.5 lg:col-span-1">
        <span className={label}>Kind</span>
        <NativeSelect
          size="sm"
          className="w-full"
          aria-label="Kind of line"
          value={type}
          onChange={(e) => {
            const t = e.target.value;
            setType(t);
            // a new line takes the usual unit for its kind
            if (!line) setUnit(defaultUnit(t));
            saveNow({ lineType: t });
          }}
        >
          {LINE_TYPES.map((t) => (
            <NativeSelectOption key={t.key} value={t.key} title={t.hint}>
              {t.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Qty</span>
        <Input aria-label="Quantity" inputMode="numeric" className={field} value={qty} onFocus={selectAll} onChange={(e) => setQty(e.target.value)} />
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Unit</span>
        <NativeSelect
          size="sm"
          className="w-full"
          aria-label="Unit"
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value);
            saveNow({ unit: e.target.value });
          }}
        >
          {UNITS.map((u) => (
            <NativeSelectOption key={u} value={u}>
              {u}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Cost</span>
        <Input aria-label="Our cost per unit (AED)" inputMode="decimal" placeholder="cost" className={field} value={cost} onFocus={selectAll} onChange={(e) => onCost(e.target.value)} />
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Margin %</span>
        <Input aria-label="Margin on cost (%)" inputMode="decimal" placeholder="%" className={field} value={margin} onFocus={selectAll} onChange={(e) => onMargin(e.target.value)} />
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Price</span>
        <Input aria-label="Selling price per unit (AED)" inputMode="decimal" placeholder="price" className={field} value={price} onFocus={selectAll} onChange={(e) => onPrice(e.target.value)} />
      </label>
      <div className={`hidden text-right text-sm font-medium tabular-nums lg:block ${optional ? "text-muted-foreground line-through decoration-muted-foreground/50" : ""}`} aria-label="Line total">
        {shownTotal}
      </div>
      <div className="col-span-4 flex items-center justify-between gap-0.5 lg:col-span-1 lg:justify-end">
        <span className="text-sm font-medium tabular-nums lg:hidden">{shownTotal}</span>
        <span className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={optional}
            className={optional ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}
            aria-label={optional ? "Optional extra: click to include it in the total" : "Make this an optional extra (left out of the total)"}
            title={optional ? "Optional extra: click to include it in the total" : "Make this an optional extra (left out of the total)"}
            onClick={() => {
              setOptional(!optional);
              saveNow({ optional: !optional });
            }}
          >
            <span className="text-[11px] font-semibold">OPT</span>
          </Button>
          {line ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="More for this line" title={saving ? "Saving…" : "More"} pending={pending || saving} />}>
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem disabled={first} onClick={() => run(() => moveBoqLine(line.id, "up"))}>
                  <ArrowUp /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onClick={() => run(() => moveBoqLine(line.id, "down"))}>
                  <ArrowDown /> Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => run(() => deleteBoqLine(line.id), "Line removed")}>
                  <Trash2 /> Remove line
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="icon-sm" aria-label="Add this line" title="Add this line (or press Enter)" pending={pending} disabled={!desc.trim()} onClick={add}>
              <Plus />
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}

function SectionHeader({
  projectId,
  section,
  lines,
  first,
  last,
  known,
  canFindPrice,
  defaultMargin,
}: {
  projectId: number;
  section: string;
  lines: BoqLineRow[];
  first: boolean;
  last: boolean;
  known: boolean;
  canFindPrice: boolean;
  defaultMargin: number;
}) {
  const [mode, setMode] = useState<"" | "rename" | "margin">("");
  const [name, setName] = useState(section);
  const [margin, setMargin] = useState(String(defaultMargin));
  const [pending, run] = useRun();
  const m = boqMoney(lines);
  const title = section || "Not in a section";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-2 py-1.5">
      {mode === "rename" ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renameBoqSection(projectId, section, name), "Section renamed", () => setMode(""));
          }}
        >
          <Input autoFocus aria-label="Section name" className="h-7 w-56 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" pending={pending} disabled={!name.trim()}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("")}>
            Cancel
          </Button>
        </form>
      ) : mode === "margin" ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parse(margin);
            if (v == null || v < 0) return void toast.error("Type a margin, e.g. 25.");
            run(async () => {
              const r = await applySectionMargin(projectId, section, v);
              toast.success(`Margin ${v}% set on ${r.changed} line${r.changed === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} without a cost kept their price)` : ""}`);
              setMode("");
            });
          }}
        >
          <span className="text-sm font-semibold">{title}</span>
          <Input autoFocus onFocus={(e) => e.currentTarget.select()} aria-label="Margin for the whole section (%)" inputMode="decimal" className="h-7 w-20 text-right text-sm" value={margin} onChange={(e) => setMargin(e.target.value)} />
          <span className="text-xs text-muted-foreground">% on every line with a cost</span>
          <Button type="submit" size="sm" pending={pending}>
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("")}>
            Cancel
          </Button>
        </form>
      ) : (
        <h3 className={`text-sm font-semibold ${section ? "" : "text-muted-foreground"}`}>{title}</h3>
      )}
      <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
        <span title="Selling total of this section, before VAT">
          <span className="font-medium text-foreground">{money(m.sell)}</span>
        </span>
        {m.cost > 0 && <span title="Our cost of the lines that have one">cost {money(m.cost)}</span>}
        {m.marginPct != null && <span title="Profit as a share of our cost (margin on cost, like each line), for lines with a cost">margin {m.marginPct}%</span>}
      </span>
      <span className="flex items-center">
        {canFindPrice && (
          <FindPrice
            defaultMargin={defaultMargin}
            initialQuery=""
            title={`Find a supplier price for ${title}`}
            onAdd={async (offerId, qty, marginPct) => addBoqLineFromOffer(projectId, section, offerId, qty, marginPct)}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={`Find a supplier price for ${title}`} title="Find a supplier price" />}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${title}`} title="Section" pending={pending} />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() => {
                setName(section);
                setMode("rename");
              }}
            >
              <Pencil /> {section ? "Rename" : "Put these lines in a section"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode("margin")}>
              <Percent /> Margin for the whole section
            </DropdownMenuItem>
            {known && (
              <>
                <DropdownMenuItem disabled={first} onClick={() => run(() => moveBoqSection(projectId, section, "up"))}>
                  <ArrowUp /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onClick={() => run(() => moveBoqSection(projectId, section, "down"))}>
                  <ArrowDown /> Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={lines.length > 0} onClick={() => run(() => deleteBoqSection(projectId, section), "Section removed")}>
                  <Trash2 /> {lines.length ? "Remove (empty it first)" : "Remove section"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}

function AddSection({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, run] = useRun();
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderPlus /> Add section
      </Button>
    );
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addBoqSection(projectId, name), "Section added", () => {
          setName("");
          setOpen(false);
        });
      }}
    >
      <Input autoFocus aria-label="New section name" placeholder="e.g. Alarm system" className="h-8 w-48 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" size="sm" pending={pending} disabled={!name.trim()}>
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

export function BoqEditor({
  projectId,
  dealId,
  sections,
  lines,
  quotes,
  defaults,
  canFindPrice,
  canOpenQuotes,
}: {
  projectId: number;
  dealId: number;
  sections: string[];
  lines: BoqLineRow[];
  quotes: QuoteSummary[];
  defaults: { marginPct: number; vatPct: number };
  canFindPrice: boolean;
  /** The quote pages live in Sales. */
  canOpenQuotes: boolean;
}) {
  const [pending, run] = useRun();
  const groups = groupBoq(lines, sections);
  const known = new Set(sections);
  const m = boqMoney(lines);
  const vat = round2((m.sell * defaults.vatPct) / 100);
  const accepted = quotes.find((q) => q.status === "accepted");
  const open = quotes.find((q) => q.status === "draft" || q.status === "sent");
  const quoteLink = (id: number, text: React.ReactNode) =>
    canOpenQuotes ? (
      <Link href={`/sales/quotes/${id}`} className="font-mono font-medium hover:underline">
        {text}
      </Link>
    ) : (
      <span className="font-mono font-medium">{text}</span>
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <AddSection projectId={projectId} />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Group the work in sections. Prices are in AED before VAT; typed boxes save when you leave them.
          {canFindPrice && (
            <>
              {" "}
              <Search className="inline size-3" /> on a section finds a supplier price.
            </>
          )}
        </p>
        {accepted ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="The customer accepted this quote. Changes here no longer reach the customer.">
            <CircleCheck className="size-4 text-emerald-600" /> Quote {quoteLink(accepted.id, accepted.number)} accepted
          </span>
        ) : open ? (
          <Button
            size="sm"
            pending={pending}
            disabled={!lines.length}
            title={`Rewrite ${open.number} with this BOQ. It keeps its number${open.status === "sent" ? "; send it to the customer again after" : ""}.`}
            onClick={() =>
              run(async () => {
                await settled();
                const r = await reviseQuote(open.id);
                toast.success(`Quote ${r.number} updated${r.wasSent ? ". Send it to the customer again." : ""}`);
              })
            }
          >
            <RefreshCw /> Update {open.number}
          </Button>
        ) : (
          <Button
            size="sm"
            pending={pending}
            disabled={!lines.length}
            title={lines.length ? "Make a numbered quote (ZQ) from this BOQ; optional extras stay out of it" : "Add at least one line first"}
            onClick={() =>
              run(async () => {
                await settled();
                const r = await createQuote(dealId);
                toast.success(`Quote ${r.number} made`);
              })
            }
          >
            <FilePlus2 /> Make quote
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className={`hidden ${COLS} gap-x-2 border-b bg-card px-2 py-1 text-xs text-muted-foreground lg:grid`}>
          <span>Item</span>
          <span>Kind</span>
          <span className="text-right">Qty</span>
          <span>Unit</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Margin %</span>
          <span className="text-right">Price</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {groups.map((g, gi) => {
          const realIndex = sections.indexOf(g.section);
          return (
            <section key={g.section || "__none"} aria-label={g.section || "Not in a section"}>
              <SectionHeader
                projectId={projectId}
                section={g.section}
                lines={g.lines}
                first={realIndex <= 0}
                last={realIndex === sections.length - 1}
                known={known.has(g.section) && g.section !== NO_SECTION}
                canFindPrice={canFindPrice}
                defaultMargin={defaults.marginPct}
              />
              <div className="px-2">
                {g.lines.map((l, i) => (
                  <Line key={l.id} projectId={projectId} section={g.section} line={l} defaultMargin={defaults.marginPct} first={i === 0} last={i === g.lines.length - 1} />
                ))}
                <Line key={`new-${g.section}-${g.lines.length}-${gi}`} projectId={projectId} section={g.section} defaultMargin={defaults.marginPct} />
              </div>
            </section>
          );
        })}
        {!groups.length && <p className="p-4 text-sm text-muted-foreground">No sections yet. Add one to start the BOQ.</p>}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1 text-xs text-muted-foreground">
          {m.optionalCount > 0 && (
            <span>
              {m.optionalCount} optional extra{m.optionalCount === 1 ? "" : "s"} worth {money(m.optionalSell)}, offered on the proposal, not in the total.
            </span>
          )}
          {quotes.length > 0 && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              Quotes:
              {quotes.map((q) => (
                <span key={q.id} className="inline-flex items-center gap-1.5">
                  {quoteLink(q.id, q.number)} <QuoteStatusBadge status={q.shownStatus} /> {money(q.total)} · valid until {dayLabel(q.validUntil)}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="ml-auto grid w-full max-w-80 gap-0.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{money(m.sell)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">VAT {defaults.vatPct}%</span>
            <span className="tabular-nums">{money(vat)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(round2(m.sell + vat))}</span>
          </div>
          {m.cost > 0 && (
            <div className="mt-1 flex justify-between text-xs text-muted-foreground" title="Inside the company only: never shown on the quote">
              <span>
                Cost {money(m.cost)} · profit{m.noCost > 0 ? ` (${m.noCost} line${m.noCost === 1 ? "" : "s"} without cost left out)` : ""}
              </span>
              <span className="tabular-nums">
                {money(m.profit)}
                {m.marginPct != null ? ` · ${m.marginPct}%` : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
