"use client";

import { useQuery } from "@tanstack/react-query";
import { Package, Plus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveItem } from "@/app/(app)/sales/items/item-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PickedItem } from "@/lib/items-data";
import { money } from "@/lib/quotation";
import { errorText } from "@/lib/user-error";

export type { PickedItem };

/**
 * The item button at the start of a document line: search the item list by SKU, part number, name or brand and pick
 * one; the line takes its name, price, unit and VAT code (the form decides which). Typing a line by hand still works.
 * `kind` is what a quick "add as new item" makes.
 */
export function ItemPickButton({ onPick, kind = "goods", label = "Pick an item" }: { onPick: (item: PickedItem) => void; kind?: "goods" | "service"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [adding, startAdd] = useTransition();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const hits = useQuery<{ items: PickedItem[] }>({
    queryKey: ["item-picker", debounced],
    queryFn: () => fetch(`/api/items/search?q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: open && debounced.length >= 1,
  });
  const pick = (it: PickedItem) => {
    onPick(it);
    setOpen(false);
  };
  const items = hits.data?.items ?? [];
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        // every time it opens it starts empty: no search left over from the last line
        if (o) {
          setQ("");
          setDebounced("");
        }
        setOpen(o);
      }}
    >
      <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} />}>
        <Package />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, part number or name…" autoComplete="off" aria-label="Search items" />
        <div className="mt-1 grid max-h-72 overflow-y-auto">
          {items.map((it) => (
            <button key={it.id} type="button" className="grid gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => pick(it)}>
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.name}</span>
                {it.salePrice != null && <span className="shrink-0 text-xs tabular-nums">{money(it.salePrice)}</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[it.sku, it.partNumber, it.brand, it.trackStock ? `${it.onHand} ${it.unit} in stock` : it.kind === "service" ? "service" : ""].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
          {debounced && hits.data && !items.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">No item matches “{debounced}”.</p>}
          {debounced.length >= 2 && hits.data && !items.some((i) => i.name.toLowerCase() === debounced.toLowerCase()) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              pending={adding}
              onClick={() =>
                startAdd(async () => {
                  try {
                    const r = await saveItem({ name: debounced, kind });
                    pick({ id: r.id, sku: r.sku, name: debounced, description: "", unit: kind === "service" ? "job" : "pcs", kind, brand: "", partNumber: "", salePrice: null, purchasePrice: null, taxCode: "SR", trackStock: false, trackSerials: false, onHand: 0 });
                    toast.success(`Item ${r.sku} added`);
                  } catch (e) {
                    toast.error(errorText(e));
                  }
                })
              }
            >
              <Plus /> Add “{debounced}” as a new item
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Shows that a line is linked to an item (its SKU); the cross unlinks it and leaves the line as typed. */
export function ItemChip({ sku, onClear }: { sku: string; onClear?: () => void }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded border bg-muted/50 pl-1.5 font-mono text-[11px] text-muted-foreground" title="Linked to this item">
      {sku}
      {onClear ? (
        <button type="button" className="grid size-4 place-items-center rounded hover:bg-muted" aria-label={`Unlink ${sku}`} onClick={onClear}>
          <X className="size-3" />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );
}

/** Serial numbers typed one per line (or separated by commas or semicolons). */
export const serialList = (s: string) =>
  s
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * The serial numbers of a line whose item keeps them: one per unit, typed or scanned one per line. The count must equal
 * the quantity before the document saves (the server checks it too).
 */
export function SerialsField({ qty, value, onChange, label = "Serial numbers" }: { qty: number; value: string; onChange: (v: string) => void; label?: string }) {
  const need = Number.isFinite(qty) && qty > 0 ? Math.round(qty * 100) / 100 : 0;
  const typed = serialList(value).length;
  if (!need) return null;
  return (
    <div className="grid gap-0.5">
      <textarea
        rows={Math.min(4, Math.max(1, need))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}, one per line`}
        aria-label={label}
        className="w-full rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <span className={`text-xs ${typed === need ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>
        {typed} of {need} serial number{need === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/** "Only 2 in stock" under a sales line when stock has started and the line asks for more than is on hand. */
export function ShortageNote({ qty, onHand, unit }: { qty: number; onHand: number; unit: string }) {
  if (!(qty > onHand)) return null;
  return (
    <span className="text-xs text-amber-600 dark:text-amber-400">
      Only {Math.max(onHand, 0)} {unit} in stock
    </span>
  );
}
