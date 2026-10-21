"use client";

import { FilePlus2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayLabel } from "@/lib/dates";
import { lineTotal, marginOf, money, sellPrice, totals } from "@/lib/quotation";
import type { DealItemRow, QuoteSummary } from "@/lib/quotes-data";
import { addItem, createQuote, deleteItem, updateItem } from "../../quote-actions";
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
 * One line. An existing line saves itself when you leave a box; the new-line row has an Add button.
 * Cost and margin fix the price (price = cost plus margin); typing a price works out the margin instead.
 */
function Row({ dealId, item, defaultMargin }: { dealId: number; item?: DealItemRow; defaultMargin: number }) {
  const [desc, setDesc] = useState(item?.description ?? "");
  const [qty, setQty] = useState(String(item?.qty ?? 1));
  const [cost, setCost] = useState(show(item?.costAed));
  const [margin, setMargin] = useState(show(item?.marginPct));
  const [price, setPrice] = useState(show(item?.unitPriceAed));
  const [pending, run] = useRun();

  const q = Math.max(1, Math.floor(parse(qty) ?? 1));
  const c = parse(cost);
  const p = parse(price) ?? 0;

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

  const input = () => ({ description: desc, qty: q, costAed: c, unitPriceAed: p });
  const changed =
    !item || desc !== item.description || q !== item.qty || c !== item.costAed || p !== item.unitPriceAed;

  const save = () => {
    if (!item || !changed || pending) return;
    if (!desc.trim()) return void toast.error("The item needs a description.");
    run(() => updateItem(item.id, input()));
  };
  const add = () =>
    run(
      () => addItem(dealId, input()),
      "Line added",
      () => {
        setDesc("");
        setQty("1");
        setCost("");
        setMargin("");
        setPrice("");
      },
    );

  const field = "h-8 px-2 text-right text-sm tabular-nums";
  const label = "text-[11px] text-muted-foreground sm:sr-only";
  return (
    <div className={`grid ${COLS} items-end gap-x-2 gap-y-1 border-b py-2 sm:items-center`}>
      <div className="col-span-4 sm:col-span-1">
        <Input
          aria-label="Item description"
          placeholder={item ? undefined : "Add a line: what are we selling?"}
          className="h-8 text-sm"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={save}
        />
        {item?.supplierName && <div className="mt-0.5 px-1 text-[11px] text-muted-foreground">from {item.supplierName}</div>}
      </div>
      <label className="grid gap-0.5">
        <span className={label}>Qty</span>
        <Input aria-label="Quantity" inputMode="numeric" className={field} value={qty} onChange={(e) => setQty(e.target.value)} onBlur={save} />
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Cost</span>
        <Input aria-label="Our cost per unit (AED)" inputMode="decimal" placeholder="cost" className={field} value={cost} onChange={(e) => onCost(e.target.value)} onBlur={save} />
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Margin %</span>
        <Input aria-label="Margin on cost (%)" inputMode="decimal" placeholder="%" className={field} value={margin} onChange={(e) => onMargin(e.target.value)} onBlur={save} />
      </label>
      <label className="grid gap-0.5">
        <span className={label}>Price</span>
        <Input aria-label="Selling price per unit (AED)" inputMode="decimal" placeholder="price" className={field} value={price} onChange={(e) => onPrice(e.target.value)} onBlur={save} />
      </label>
      <div className="hidden text-right text-sm font-medium tabular-nums sm:block" aria-label="Line total">
        {money(lineTotal({ qty: q, unitPrice: p }))}
      </div>
      <div className="col-span-4 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
        <span className="text-sm font-medium tabular-nums sm:hidden">{money(lineTotal({ qty: q, unitPrice: p }))}</span>
        {item ? (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label="Remove this line" title="Remove this line" disabled={pending} onClick={() => run(() => deleteItem(item.id))}>
            <Trash2 />
          </Button>
        ) : (
          <Button size="icon-sm" aria-label="Add this line" title="Add this line" disabled={pending || !desc.trim() || !(p > 0)} onClick={add}>
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

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {canFindPrice && <FindPrice dealId={dealId} defaultMargin={defaults.marginPct} initialQuery={searchHint} />}
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {canFindPrice ? "Find a supplier price or type a line. " : "Type each line with the price you will charge. "}
          Prices are in AED before VAT. Changes save when you leave a box.
        </p>
        <Button
          size="sm"
          disabled={pending || !items.length}
          title={items.length ? "Make a numbered quote from these lines" : "Add at least one line first"}
          onClick={() => run(async () => {
            const r = await createQuote(dealId);
            toast.success(`Quote ${r.number} made`);
            router.push(`/sales/quotes/${r.id}`);
          })}
        >
          <FilePlus2 /> Make quote
        </Button>
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
                <Link href={`/sales/quotes/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
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
