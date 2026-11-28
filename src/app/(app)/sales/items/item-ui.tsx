"use client";

import { Download, FolderTree, MoreHorizontal, Pencil, Plus, Power, Sparkles, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessType } from "@/lib/apps";
import { defaultUnit, ITEM_CSV_TEMPLATE, parseItemsCsv, unitsFor, type ItemCsvRow, type ItemKind } from "@/lib/items";
import { errorText } from "@/lib/user-error";
import { addStarterCategories, deleteCategory, deleteItem, importItems, saveCategory, saveItem, setItemActive } from "./item-actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string, after?: (r: unknown) => void) =>
    start(async () => {
      try {
        const r = await fn();
        toast.success(ok);
        after?.(r);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

const VAT_OPTIONS = [
  { code: "SR", label: "Standard 5%" },
  { code: "ZR", label: "Zero-rated 0%" },
  { code: "EX", label: "Exempt" },
  { code: "OS", label: "Out of scope" },
] as const;

export interface CategoryOption {
  id: number;
  name: string;
  kind: ItemKind;
  unit: string;
  taxCode: string;
  trackStock: boolean;
  trackSerials: boolean;
  items: number;
}

/** An item as the dialog edits it. */
export interface ItemDraft {
  id?: number;
  sku: string;
  name: string;
  description: string;
  categoryId: number | null;
  brand: string;
  partNumber: string;
  unit: string;
  kind: ItemKind;
  trackStock: boolean;
  trackSerials: boolean;
  salePrice: number | null;
  purchasePrice: number | null;
  taxCode: string;
  reorderLevel: number | null;
  notes: string;
  isActive: boolean;
}

const blank = (business: BusinessType | null): ItemDraft => {
  const kind: ItemKind = business === "trader" ? "goods" : "service";
  return { sku: "", name: "", description: "", categoryId: null, brand: "", partNumber: "", unit: defaultUnit(kind), kind, trackStock: business === "trader", trackSerials: false, salePrice: null, purchasePrice: null, taxCode: "SR", reorderLevel: null, notes: "", isActive: true };
};

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const text = (n: number | null) => (n == null ? "" : String(n));

/**
 * Add or change an item. A trader sees goods fields (brand, part number, stock and serial tracking, reorder level); a
 * service provider a plain service with its rate. Purchase price only for the accounts team.
 */
export function ItemDialog({ item, categories, business, finance, trigger }: { item?: ItemDraft; categories: CategoryOption[]; business: BusinessType | null; finance: boolean; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const start = () => item ?? blank(business);
  const [f, setF] = useState<ItemDraft>(start);
  const [prices, setPrices] = useState({ sale: text(start().salePrice), purchase: text(start().purchasePrice), reorder: text(start().reorderLevel) });
  const trader = business === "trader";
  const goods = f.kind === "goods";
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const pickCategory = (id: number | null) => {
    const c = categories.find((x) => x.id === id);
    // a new item takes what its category presets; an existing one only changes category
    if (c && !f.id) setF((x) => ({ ...x, categoryId: id, kind: trader ? c.kind : "service", unit: c.unit || defaultUnit(trader ? c.kind : "service"), taxCode: c.taxCode, trackStock: trader && c.kind === "goods" && c.trackStock, trackSerials: trader && c.kind === "goods" && c.trackSerials }));
    else set("categoryId", id);
  };
  const units = unitsFor(f.kind);
  const bad = [prices.sale, prices.purchase, prices.reorder].some((p) => p.trim() !== "" && !(Number(p) >= 0));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // start from the item as it is now, not from what was typed and cancelled last time
        if (o) {
          const s = start();
          setF(s);
          setPrices({ sale: text(s.salePrice), purchase: text(s.purchasePrice), reorder: text(s.reorderLevel) });
        }
        setOpen(o);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{f.id ? `Item ${f.sku}` : trader ? "New item" : "New service"}</DialogTitle>
          <DialogDescription>{trader ? "Pick it on quotes, orders, invoices and bills instead of typing the line." : "Pick it on quotes and invoices instead of typing the line."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="it-name">Name</Label>
            <Input id="it-name" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={200} placeholder={trader ? "e.g. Lenovo ThinkPad E14 Gen 6" : "e.g. Network maintenance visit"} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="it-sku">SKU</Label>
            <Input id="it-sku" value={f.sku} onChange={(e) => set("sku", e.target.value)} maxLength={40} placeholder="blank = next ITM number" className="font-mono" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="it-cat">Category</Label>
            <NativeSelect id="it-cat" value={f.categoryId ? String(f.categoryId) : ""} onChange={(e) => pickCategory(e.target.value ? Number(e.target.value) : null)}>
              <NativeSelectOption value="">No category</NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={String(c.id)}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {trader && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Kind</Label>
              <div className="inline-flex w-fit rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="Kind">
                {(["goods", "service"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={f.kind === k}
                    onClick={() => setF((x) => ({ ...x, kind: k, unit: unitsFor(k).includes(x.unit) ? x.unit : defaultUnit(k), trackStock: k === "goods" && x.trackStock, trackSerials: k === "goods" && x.trackSerials }))}
                    className={`h-7 rounded-md px-3 text-xs font-medium ${f.kind === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    {k === "goods" ? "Goods" : "Service"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {trader && goods && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="it-brand">Brand</Label>
                <Input id="it-brand" value={f.brand} onChange={(e) => set("brand", e.target.value)} maxLength={80} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="it-pn">Part number</Label>
                <Input id="it-pn" value={f.partNumber} onChange={(e) => set("partNumber", e.target.value)} maxLength={80} className="font-mono" />
              </div>
            </>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="it-unit">Unit</Label>
            <Input id="it-unit" list="it-units" value={f.unit} onChange={(e) => set("unit", e.target.value)} maxLength={20} />
            <datalist id="it-units">
              {units.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="it-vat">VAT</Label>
            <NativeSelect id="it-vat" value={f.taxCode} onChange={(e) => set("taxCode", e.target.value)}>
              {VAT_OPTIONS.map((o) => (
                <NativeSelectOption key={o.code} value={o.code}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="it-sale">{goods ? "Selling price" : "Rate"} (AED, before VAT)</Label>
            <Input id="it-sale" inputMode="decimal" className="text-right" value={prices.sale} onChange={(e) => setPrices({ ...prices, sale: e.target.value })} />
          </div>
          {finance && (
            <div className="grid gap-1.5">
              <Label htmlFor="it-cost">Purchase price (AED, before VAT)</Label>
              <Input id="it-cost" inputMode="decimal" className="text-right" value={prices.purchase} onChange={(e) => setPrices({ ...prices, purchase: e.target.value })} />
            </div>
          )}
          {trader && goods && (
            <div className="grid gap-2 rounded-lg border p-2.5 sm:col-span-2">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={f.trackStock} onCheckedChange={(v) => setF((x) => ({ ...x, trackStock: !!v, trackSerials: !!v && x.trackSerials }))} />
                <span className="grid leading-tight">
                  Track stock
                  <span className="text-xs text-muted-foreground">Bills add to stock, invoices take from it (once stock is started in Inventory › Settings)</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm aria-disabled:opacity-50" aria-disabled={!f.trackStock}>
                <Checkbox className="mt-0.5" disabled={!f.trackStock} checked={f.trackSerials} onCheckedChange={(v) => set("trackSerials", !!v)} />
                <span className="grid leading-tight">
                  Serial numbers
                  <span className="text-xs text-muted-foreground">Enter them when buying, pick them when selling (warranty lookups)</span>
                </span>
              </label>
              {f.trackStock && (
                <div className="flex items-center gap-2 text-sm">
                  <Label htmlFor="it-reorder" className="font-normal">
                    Warn when available falls below
                  </Label>
                  <Input id="it-reorder" inputMode="decimal" className="h-7 w-20 text-right" value={prices.reorder} onChange={(e) => setPrices({ ...prices, reorder: e.target.value })} />
                  <span className="text-muted-foreground">{f.unit}</span>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="it-desc">Description on documents</Label>
            <Textarea id="it-desc" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} placeholder="Optional: specs or scope, printed under the name" />
          </div>
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!f.name.trim() || bad}
            onClick={() =>
              run(
                () =>
                  saveItem({
                    ...f,
                    salePrice: numOrNull(prices.sale),
                    purchasePrice: numOrNull(prices.purchase),
                    reorderLevel: numOrNull(prices.reorder),
                    taxCode: f.taxCode as "SR",
                  }),
                f.id ? "Item saved" : "Item added",
                () => setOpen(false),
              )
            }
          >
            {f.id ? "Save" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The ⋯ menu of a row: switch off / on, delete (only when no document uses it). */
export function ItemRowMenu({ id, name, active }: { id: number; name: string; active: boolean }) {
  const [pending, run] = useRun();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`} disabled={pending} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run(() => setItemActive(id, !active), active ? "Item switched off" : "Item switched on")}>
          <Power /> {active ? "Switch off" : "Switch on"}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            if (confirm(`Delete ${name}? Only an item that no document uses can be deleted.`)) run(() => deleteItem(id), "Item deleted");
          }}
        >
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The categories of the item list, kept from the toolbar: add, rename, delete, or the starter set. */
export function CategoriesPopover({ categories, business }: { categories: CategoryOption[]; business: BusinessType | null }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const trader = business === "trader";
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setName("");
          setEditing(null);
        }
        setOpen(o);
      }}
    >
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <FolderTree /> Categories
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="grid max-h-72 gap-0.5 overflow-y-auto">
          {categories.map((c) =>
            editing?.id === c.id ? (
              <form
                key={c.id}
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => saveCategory({ ...c, kind: c.kind, taxCode: c.taxCode as "SR", name: editing.name }), "Category renamed", () => setEditing(null));
                }}
              >
                <Input className="h-7" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} />
                <Button size="sm" type="submit" pending={pending}>
                  Save
                </Button>
              </form>
            ) : (
              <div key={c.id} className="group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{c.items}</span>
                <Button variant="ghost" size="icon-xs" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => {
                    if (confirm(`Delete the category ${c.name}?${c.items ? ` Its ${c.items} item${c.items === 1 ? "" : "s"} stay, without a category.` : ""}`)) run(() => deleteCategory(c.id), "Category deleted");
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          )}
          {!categories.length && <p className="px-1.5 py-1 text-sm text-muted-foreground">No categories yet.</p>}
        </div>
        <form
          className="flex gap-1 border-t pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveCategory({ name, kind: trader ? "goods" : "service", trackStock: trader }), "Category added", () => setName(""));
          }}
        >
          <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={80} aria-label="New category name" />
          <Button size="sm" type="submit" disabled={!name.trim()} pending={pending}>
            <Plus /> Add
          </Button>
        </form>
        {!categories.length && (
          <Button variant="ghost" size="sm" className="justify-start" pending={pending} onClick={() => run(() => addStarterCategories(), "Starter categories added")}>
            <Sparkles /> Add starter categories
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Import items from a CSV (Excel: Save as CSV). Read here in the browser; only the rows go to the server. */
export function ImportItemsDialog() {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [read, setRead] = useState<{ rows: ItemCsvRow[]; problems: string[] } | null>(null);
  const [fileName, setFileName] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setRead(null);
          setFileName("");
        }
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload /> Import
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import items</DialogTitle>
          <DialogDescription>A CSV with a header row. A SKU that already exists is updated; blank SKUs get the next ITM number.</DialogDescription>
        </DialogHeader>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([ITEM_CSV_TEMPLATE], { type: "text/csv" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "items-template.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> Template
        </Button>
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            setRead(parseItemsCsv(await file.text()));
          }}
        />
        {read && (
          <div className="grid gap-1 text-sm">
            <p>
              {fileName}: <strong>{read.rows.length}</strong> item{read.rows.length === 1 ? "" : "s"} read.
            </p>
            {read.problems.length > 0 && (
              <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs text-red-600 dark:text-red-400">
                {read.problems.slice(0, 20).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!read || !read.rows.length || read.problems.length > 0}
            onClick={() => read && run(() => importItems(read.rows), "Items imported", (r) => {
              const x = r as { created: number; updated: number };
              toast.message(`${x.created} added, ${x.updated} updated`);
              setOpen(false);
            })}
          >
            Import {read?.rows.length ?? ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
