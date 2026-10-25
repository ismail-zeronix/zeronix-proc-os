"use client";

import { CircleCheck, FilePlus2, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayLabel } from "@/lib/dates";
import { lineTotal, marginOf, money, sellPrice, totals } from "@/lib/quotation";
import type { DealItemRow, QuoteSummary } from "@/lib/quotes-data";
import { addItem, createQuote, deleteItem, reviseQuote, updateItem } from "../../quote-actions";
import { FindPrice } from "./find-price";

const COLS = "grid-cols-4 sm:grid-cols-[minmax(0,1fr)_4rem_6rem_5rem_6.5rem_6.5rem_2rem]";

const parse = (s: string): number | null => {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const show = (n: number | null | undefined) => (n == null ? "" : String(n));

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

/**
 * Saves still on their way to the server. "Make quote" and "Update" wait for them, so a line changed a moment before
 * the click is in the quote.
 */
const inflight = new Set<Promise<unknown>>();
const settled = () => Promise.allSettled([...inflight]);

type RowValues = { description: string; qty: number; costAed: number | null; unitPriceAed: number };
const sameValues = (a: RowValues, b: RowValues) => a.description.trim() === b.description.trim() && a.qty === b.qty && a.costAed === b.costAed && a.unitPriceAed === b.unitPriceAed;
const valuesOf = (i: DealItemRow): RowValues => ({ description: i.description, qty: i.qty, costAed: i.costAed, unitPriceAed: i.unitPriceAed });

/**
 * One line, edited like a spreadsheet row. The row saves when you leave it (Tab or click out of its last box), so typing
 * qty, cost and margin one after the other is one save. Saves of a row run one after another, never at the same time,
 * so a later change is never lost under an earlier one. On the empty row, leaving it with a description and a price adds
 * the line (as do Enter and the Add button).
 * Cost and margin fix the price (price = cost plus margin); typing a price works out the margin instead.
 */
function Row({ dealId, item, defaultMargin }: { dealId: number; item?: DealItemRow; defaultMargin: number }) {
  const [desc, setDesc] = useState(item?.description ?? "");
  const [qty, setQty] = useState(String(item?.qty ?? 1));
  const [cost, setCost] = useState(show(item?.costAed));
  const [margin, setMargin] = useState(show(item?.marginPct));
  const [price, setPrice] = useState(show(item?.unitPriceAed));
  const [saving, setSaving] = useState(false);
  const [pending, run] = useRun();
  const rowRef = useRef<HTMLDivElement>(null);

  const q = Math.max(1, Math.round(parse(qty) ?? 1));
  const c = parse(cost);
  const p = parse(price) ?? 0;

  const values: RowValues = { description: desc, qty: q, costAed: c, unitPriceAed: p };
  // the latest typed values, for a save that starts after the one before it has finished
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  });
  // what the server has: leaving a row you did not change saves nothing
  const saved = useRef<RowValues | null>(item ? valuesOf(item) : null);
  const chain = useRef<Promise<unknown> | null>(null);
  const again = useRef(false);

  const fromServer = item ? JSON.stringify([valuesOf(item), item.marginPct]) : "";
  // the server changed the line (another tab, a refresh): show it, unless the person is typing in it
  useEffect(() => {
    if (!item) return;
    saved.current = valuesOf(item);
    if (chain.current || rowRef.current?.contains(document.activeElement)) return;
    setDesc(item.description);
    setQty(String(item.qty));
    setCost(show(item.costAed));
    setMargin(show(item.marginPct));
    setPrice(show(item.unitPriceAed));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fromServer stands for the line's values
  }, [fromServer]);

  const onCost = (v: string) => {
    setCost(v);
    const nc = parse(v);
    const m = parse(margin) ?? (nc != null ? defaultMargin : null);
    if (nc != null && m != null) {
      setMargin(String(m));
      setPrice(String(sellPrice(nc, m)));
    }
  };
  const onMargin = (v: string) => {
    setMargin(v);
    const m = parse(v);
    if (c != null && m != null) setPrice(String(sellPrice(c, m)));
  };
  const onPrice = (v: string) => {
    setPrice(v);
    const np = parse(v);
    const m = np != null ? marginOf(c, np) : null;
    if (m != null) setMargin(String(m));
  };

  const persist = () => {
    if (!item) return;
    if (chain.current) {
      again.current = true;
      return;
    }
    const job = (async () => {
      setSaving(true);
      try {
        let more = true;
        while (more) {
          more = false;
          const v = latest.current;
          if (!v.description.trim()) {
            toast.error("The item needs a description.");
            break;
          }
          if (!saved.current || !sameValues(v, saved.current)) {
            await updateItem(item.id, v);
            saved.current = v;
          }
          // changes made while that save was on its way go in the next one
          if (again.current) {
            again.current = false;
            more = true;
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

  const canAdd = !!desc.trim() && p > 0;
  const add = () => {
    if (!canAdd || pending) return;
    const v = latest.current;
    run(
      async () => {
        const job = addItem(dealId, v);
        inflight.add(job);
        try {
          await job;
        } finally {
          inflight.delete(job);
        }
      },
      "Line added",
      () => {
        setDesc("");
        setQty("1");
        setCost("");
        setMargin("");
        setPrice("");
      },
    );
  };

  // leaving the row (focus goes somewhere outside it) saves an existing line, or adds a complete new one
  const onRowBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (rowRef.current?.contains(e.relatedTarget as Node | null)) return;
    if (item) persist();
    else if (canAdd) add();
  };
  const onEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!item && e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") add();
  };
  // a click or Tab into a number box selects it, so typing replaces the number instead of adding to it
  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();

  const field = "h-8 px-2 text-right text-sm tabular-nums";
  const label = "text-[11px] text-muted-foreground sm:sr-only";
  const shownTotal = item || desc.trim() ? money(lineTotal({ qty: q, unitPrice: p })) : "";
  const unsaved = !item && desc.trim();
  return (
    <div ref={rowRef} onBlur={onRowBlur} onKeyDown={onEnter} className={`grid ${COLS} items-end gap-x-2 gap-y-1 border-b py-2 sm:items-center`}>
      <div className="col-span-4 sm:col-span-1">
        <Input
          aria-label="Item description"
          placeholder={item ? undefined : "Add a line: what are we selling?"}
          className="h-8 text-sm"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        {(item?.supplierName || unsaved) && (
          <div className="mt-0.5 px-1 text-[11px] text-muted-foreground">
            {item?.supplierName && `from ${item.supplierName}`}
            {unsaved && (p > 0 ? "Not saved yet: press Enter, + or move to another row to add it" : "Not saved yet: give it a price to add it")}
          </div>
        )}
      </div>
      <label className="grid gap-0.5">
        <span className={label}>Qty</span>
        <Input aria-label="Quantity" inputMode="numeric" className={field} value={qty} onFocus={selectAll} onChange={(e) => setQty(e.target.value)} />
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
      <div className="hidden text-right text-sm font-medium tabular-nums sm:block" aria-label="Line total">
        {shownTotal}
      </div>
      <div className="col-span-4 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
        <span className="text-sm font-medium tabular-nums sm:hidden">{shownTotal}</span>
        {item ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Remove this line"
            title={saving ? "Saving…" : "Remove this line"}
            pending={pending || saving}
            onClick={() => run(() => deleteItem(item.id))}
          >
            <Trash2 />
          </Button>
        ) : (
          <Button size="icon-sm" aria-label="Add this line" title="Add this line (or press Enter)" pending={pending} disabled={!canAdd} onClick={add}>
            <Plus />
          </Button>
        )}
      </div>
    </div>
  );
}

export function DealItems({
  dealId,
  items,
  quotes,
  defaults,
  canFindPrice,
  searchHint,
}: {
  dealId: number;
  items: DealItemRow[];
  quotes: QuoteSummary[];
  defaults: { marginPct: number; vatPct: number };
  canFindPrice: boolean;
  searchHint: string;
}) {
  const router = useRouter();
  const [pending, run] = useRun();
  const t = totals(items.map((i) => ({ qty: i.qty, unitPrice: i.unitPriceAed, cost: i.costAed })), defaults.vatPct);
  const profitPct = t.profit != null && t.soldWithCost > 0 ? Math.round((t.profit / t.soldWithCost) * 1000) / 10 : null;
  // one quote in play per deal: the accepted one, else the newest open one (quotes come newest first)
  const accepted = quotes.find((q) => q.status === "accepted");
  const open = quotes.find((q) => q.status === "draft" || q.status === "sent");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {canFindPrice && <FindPrice dealId={dealId} defaultMargin={defaults.marginPct} initialQuery={searchHint} />}
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {canFindPrice ? "Find a supplier price or type a line. " : "Type each line with the price you will charge. "}
          Prices are in AED before VAT. A line saves when you leave its row.
        </p>
        {accepted ? (
          <Link
            href={`/accounts/quotes/${accepted.id}`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="The customer accepted this quote. Changes to the lines here no longer reach the customer."
          >
            <CircleCheck className="size-4 text-emerald-600" /> Quote <span className="font-mono font-medium">{accepted.number}</span> accepted
          </Link>
        ) : open ? (
          <Button
            size="sm"
            pending={pending} disabled={!items.length}
            title={`Rewrite ${open.number} with these lines. It keeps its number${open.status === "sent" ? "; send it to the customer again after" : ""}.`}
            onClick={() =>
              run(async () => {
                await settled();
                const r = await reviseQuote(open.id);
                toast.success(`Quote ${r.number} updated${r.wasSent ? ". Send it to the customer again." : ""}`);
                router.replace(`/accounts/quotes/${r.id}`);
              })
            }
          >
            <RefreshCw /> Update {open.number}
          </Button>
        ) : (
          <Button
            size="sm"
            pending={pending} disabled={!items.length}
            title={items.length ? "Make a numbered quote from these lines" : "Add at least one line first"}
            onClick={() =>
              run(async () => {
                await settled();
                const r = await createQuote(dealId);
                toast.success(`Quote ${r.number} made`);
                router.replace(`/accounts/quotes/${r.id}`);
              })
            }
          >
            <FilePlus2 /> Make quote
          </Button>
        )}
      </div>

      <div>
        <div className={`hidden ${COLS} gap-x-2 border-b pb-1 text-xs text-muted-foreground sm:grid`}>
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Margin %</span>
          <span className="text-right">Price</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {items.map((i) => (
          <Row key={i.id} dealId={dealId} item={i} defaultMargin={defaults.marginPct} />
        ))}
        <Row key={`new-${items.length}`} dealId={dealId} defaultMargin={defaults.marginPct} />
      </div>

      <div className="ml-auto grid w-full max-w-72 gap-0.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{money(t.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">VAT {defaults.vatPct}%</span>
          <span className="tabular-nums">{money(t.vat)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(t.total)}</span>
        </div>
        {t.profit != null && (
          <div className="mt-1 flex justify-between text-xs text-muted-foreground" title="Inside the company only: never shown on the quote">
            <span>
              Profit{t.unpriced > 0 ? ` (${t.unpriced} line${t.unpriced === 1 ? "" : "s"} without cost left out)` : ""}
            </span>
            <span className="tabular-nums">
              {money(t.profit)}
              {profitPct != null ? ` · ${profitPct}%` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="border-t pt-2">
        <h3 className="mb-1 text-sm font-medium">
          Quotes <span className="font-normal text-muted-foreground">({quotes.length})</span>
        </h3>
        {quotes.length ? (
          <ul className="grid gap-0.5">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/accounts/quotes/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <span className="font-mono font-medium">{q.number}</span>
                  <QuoteStatusBadge status={q.shownStatus} />
                  <span className="tabular-nums">{money(q.total)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">valid until {dayLabel(q.validUntil)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No quote made yet.</p>
        )}
      </div>
    </div>
  );
}
