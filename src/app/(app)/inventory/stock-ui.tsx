"use client";

import { Ban, ClipboardCheck, ListPlus, PlayCircle, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ItemPickButton, serialList, type PickedItem } from "@/components/item-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { longDay, money } from "@/lib/quotation";
import { errorText } from "@/lib/user-error";
import { saveAdjustment, startStock, undoStockStart, voidAdjustment } from "./actions";

/** An item a stock form can list (all stock-tracked items are offered at once). */
export interface StockItemOption {
  id: number;
  sku: string;
  name: string;
  unit: string;
  trackSerials: boolean;
  onHand: number;
  avgCost: number;
  purchasePrice: number | null;
}

interface Row {
  item: StockItemOption;
  qty: string;
  cost: string;
  serials: string;
}

type Mode = "opening" | "count" | "write_off";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const r2 = (n: number) => Math.round(n * 100) / 100;

const fromPicked = (p: PickedItem): StockItemOption => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, trackSerials: p.trackSerials, onHand: p.onHand, avgCost: 0, purchasePrice: p.purchasePrice });

/**
 * The item lines of an opening count, a stock count or a write-off: one row per item, with the serial numbers when the
 * item keeps them. A count shows what is on hand and the difference; the opening count asks what one unit cost.
 */
function StockLines({ mode, rows, setRows, items }: { mode: Mode; rows: Row[]; setRows: (r: Row[]) => void; items: StockItemOption[] }) {
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = (it: StockItemOption) => {
    if (rows.some((r) => r.item.id === it.id)) return toast.info(`${it.name} is already on the list.`);
    setRows([...rows, { item: it, qty: "", cost: mode === "opening" && it.purchasePrice != null ? String(it.purchasePrice) : "", serials: "" }]);
  };
  const missing = items.filter((it) => !rows.some((r) => r.item.id === it.id));
  const qtyLabel = mode === "opening" ? "On the shelf" : mode === "count" ? "Counted" : "Units going";
  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Item</th>
              {mode !== "opening" && <th className="px-2 py-1.5 text-right font-medium">On hand</th>}
              <th className="w-28 px-2 py-1.5 text-right font-medium">{qtyLabel}</th>
              {mode === "count" && <th className="px-2 py-1.5 text-right font-medium">Difference</th>}
              {mode !== "write_off" && <th className="w-32 px-2 py-1.5 text-right font-medium">{mode === "opening" ? "Cost per unit" : "Cost of extra units"}</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const q = num(r.qty);
              const diff = mode === "count" && Number.isFinite(q) ? r2(q - r.item.onHand) : null;
              const serialsNeeded = !r.item.trackSerials ? 0 : mode === "count" ? Math.abs(diff ?? 0) : Number.isFinite(q) ? q : 0;
              const typed = serialList(r.serials).length;
              return (
                <tr key={r.item.id} className="border-t align-top">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{r.item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.item.sku} · {r.item.unit}
                    </div>
                    {r.item.trackSerials && serialsNeeded > 0 && (
                      <div className="mt-1 grid gap-0.5">
                        <Textarea
                          rows={Math.min(4, Math.max(2, serialsNeeded))}
                          value={r.serials}
                          onChange={(e) => set(i, { serials: e.target.value })}
                          placeholder={mode === "count" && (diff ?? 0) < 0 ? "Serial numbers missing, one per line" : "Serial numbers, one per line"}
                          aria-label={`Serial numbers of ${r.item.name}`}
                          className="font-mono text-xs"
                        />
                        <span className={`text-xs ${typed === serialsNeeded ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                          {typed} of {serialsNeeded} serial number{serialsNeeded === 1 ? "" : "s"}
                        </span>
                      </div>
                    )}
                  </td>
                  {mode !== "opening" && <td className="px-2 py-1.5 text-right tabular-nums">{r.item.onHand}</td>}
                  <td className="px-2 py-1.5">
                    <Input inputMode="decimal" className="h-8 text-right tabular-nums" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label={`${qtyLabel}: ${r.item.name}`} />
                  </td>
                  {mode === "count" && (
                    <td className={`px-2 py-1.5 text-right tabular-nums ${diff == null || diff === 0 ? "text-muted-foreground" : diff < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {diff == null ? "-" : diff > 0 ? `+${diff}` : diff}
                    </td>
                  )}
                  {mode !== "write_off" && (
                    <td className="px-2 py-1.5">
                      {mode === "count" && !((diff ?? 0) > 0) ? (
                        <span className="block pt-1.5 text-right text-xs text-muted-foreground">-</span>
                      ) : (
                        <Input
                          inputMode="decimal"
                          className="h-8 text-right tabular-nums"
                          value={r.cost}
                          onChange={(e) => set(i, { cost: e.target.value })}
                          placeholder={mode === "count" ? (r.item.avgCost ? money(r.item.avgCost) : "average") : ""}
                          aria-label={`Cost per unit: ${r.item.name}`}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-1 py-1.5">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${r.item.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No items yet. Add them with the buttons below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ItemPickButton label="Add an item" onPick={(p) => (p.trackStock ? add(items.find((x) => x.id === p.id) ?? fromPicked(p)) : toast.error(`${p.name} does not track stock. Tick "Track stock" on the item first.`))} />
          Add an item
        </span>
        {missing.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, ...missing.map((it) => ({ item: it, qty: "", cost: mode === "opening" && it.purchasePrice != null ? String(it.purchasePrice) : "", serials: "" }))])}>
            <ListPlus /> Add all {missing.length} stock item{missing.length === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- start stock ---------- */

/**
 * Inventory › Settings: the stock start date and the opening count. "Check" runs it all and saves nothing, then shows
 * what would be posted; "Start stock" posts it. Rows left without a quantity are skipped.
 */
export function StartStockForm({ today, minDate, balance1310, items }: { today: string; minDate: string; balance1310: number; items: StockItemOption[] }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [offset, setOffset] = useState<"opening_equity" | "inventory">(balance1310 > 0 ? "inventory" : "opening_equity");
  const [rows, setRows] = useState<Row[]>([]);
  const [checked, setChecked] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lines = () =>
    rows
      .filter((r) => r.qty.trim() !== "" && num(r.qty) !== 0)
      .map((r) => ({ itemId: r.item.id, qty: num(r.qty), unitCost: num(r.cost), serials: serialList(r.serials) }));
  const total = r2(lines().reduce((s, l) => s + (Number.isFinite(l.qty * l.unitCost) ? l.qty * l.unitCost : 0), 0));
  const run = (check: boolean) =>
    start(async () => {
      try {
        const bad = lines().find((l) => !Number.isFinite(l.qty) || !Number.isFinite(l.unitCost));
        if (bad) throw new Error(`${rows.find((r) => r.item.id === bad.itemId)?.item.name}: enter the quantity and the cost per unit.`);
        const r = await startStock({ date, offset, lines: lines() }, { check });
        const what = r.items ? `${r.items} item${r.items === 1 ? "" : "s"}, ${r.units} units, ${money(r.value)}` : "nothing on the shelf";
        if (check) setChecked(`Ready: stock starts ${longDay(date)} with ${what}.`);
        else {
          toast.success(`Stock started ${longDay(date)}${r.number ? ` (${r.number})` : ""}`);
          router.refresh();
        }
      } catch (e) {
        setChecked(null);
        toast.error(errorText(e));
      }
    });
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="ss-date">Stock starts on</Label>
          <Input
            id="ss-date"
            type="date"
            min={minDate}
            max={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setChecked(null);
            }}
          />
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">The opening count&apos;s value comes from</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="ss-offset" className="mt-1" checked={offset === "opening_equity"} onChange={() => setOffset("opening_equity")} />
            <span className="grid leading-tight">
              Opening balance equity
              <span className="text-xs text-muted-foreground">The goods are not in the books yet (a new start, or the bills were never entered).</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="ss-offset" className="mt-1" checked={offset === "inventory"} onChange={() => setOffset("inventory")} />
            <span className="grid leading-tight">
              Goods already bought in the books (Inventory, {money(balance1310)} today)
              <span className="text-xs text-muted-foreground">Their supplier bills were entered before the start, so their value moves into item stock.</span>
            </span>
          </label>
        </fieldset>
      </div>
      <StockLines
        mode="opening"
        rows={rows}
        setRows={(r) => {
          setRows(r);
          setChecked(null);
        }}
        items={items}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Opening value <span className="font-medium text-foreground tabular-nums">{money(total)}</span>
        </span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" pending={pending} onClick={() => run(true)}>
          <ClipboardCheck /> Check
        </Button>
        <Button type="button" size="sm" pending={pending} disabled={!checked} title={checked ? undefined : "Check first"} onClick={() => run(false)}>
          <PlayCircle /> Start stock
        </Button>
      </div>
      {checked && <p className="rounded-md border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm">{checked} Nothing is saved until you press Start stock.</p>}
    </div>
  );
}

export function UndoStartButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      pending={pending}
      title="Only while the opening count is the only thing that moved stock"
      onClick={() => {
        const why = prompt("Undo the stock start? The opening count is voided and stock stops moving with bills and invoices. Why?");
        if (why)
          start(async () => {
            try {
              await undoStockStart(why);
              toast.success("Stock start undone");
              router.refresh();
            } catch (e) {
              toast.error(errorText(e));
            }
          });
      }}
    >
      <Undo2 /> Undo stock start
    </Button>
  );
}

/* ---------- adjustments ---------- */

const KINDS = [
  { key: "count", label: "Stock count", hint: "Enter what is on the shelf; the difference from what is on hand is adjusted." },
  { key: "write_off", label: "Write-off", hint: "Units damaged, lost or used in the office leave stock at average cost." },
] as const;

/** A new stock count or write-off. Its value goes to Stock adjustments (5150). */
export function AdjustmentForm({ today, minDate, items }: { today: string; minDate: string; items: StockItemOption[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"count" | "write_off">("count");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      try {
        const lines = rows
          .filter((r) => r.qty.trim() !== "")
          .map((r) => {
            const qty = num(r.qty);
            if (!Number.isFinite(qty)) throw new Error(`${r.item.name}: enter a number.`);
            return { itemId: r.item.id, qty, unitCost: r.cost.trim() ? num(r.cost) : null, serials: serialList(r.serials) };
          });
        const r = await saveAdjustment({ date, kind, reason, lines });
        toast.success(`${r.number} saved`);
        router.replace(`/inventory/adjustments/${r.id}`);
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of adjustment">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            onClick={() => {
              setKind(k.key);
              setRows(rows.map((r) => ({ ...r, qty: "", serials: "" })));
            }}
            className={`grid max-w-xs gap-0.5 rounded-lg border px-3 py-2 text-left text-sm ${kind === k.key ? "border-foreground bg-muted/50" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className="font-medium">{k.label}</span>
            <span className="text-xs">{k.hint}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="adj-date">Date</Label>
          <Input id="adj-date" type="date" min={minDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="adj-reason">Reason</Label>
          <Input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "count" ? "Month-end count" : "Damaged in the store"} maxLength={300} />
        </div>
      </div>
      <StockLines mode={kind} rows={rows} setRows={setRows} items={items} />
      <div className="flex justify-end">
        <Button type="button" size="sm" pending={pending} disabled={!rows.length} onClick={save}>
          <ClipboardCheck /> Save adjustment
        </Button>
      </div>
    </div>
  );
}

export function VoidAdjustmentButton({ id, number }: { id: number; number: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      pending={pending}
      title="Only while nothing has moved its items since"
      onClick={() => {
        const why = prompt(`Void ${number}? Its stock moves are undone and it stays on record, crossed out. Why?`);
        if (why)
          start(async () => {
            try {
              await voidAdjustment(id, why);
              toast.success(`${number} voided`);
              router.refresh();
            } catch (e) {
              toast.error(errorText(e));
            }
          });
      }}
    >
      <Ban /> Void
    </Button>
  );
}
