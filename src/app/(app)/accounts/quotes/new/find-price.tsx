"use client";

import { ExternalLink, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ago, money } from "@/lib/format";
import { sellPrice } from "@/lib/quotation";
import { addItemFromOffer } from "../../quote-actions";

interface Offer {
  id: number;
  supplier: string;
  price: number | null;
  currency: string;
  priceAed: number | null;
  basis: string;
  stock: string;
  receivedAt: string;
  stale: boolean;
  best: boolean;
}
interface Product {
  id: number;
  label: string;
  spec: string;
  category: string;
  offers: Offer[];
}

/**
 * "Find price": searches the supplier prices from Procurement and adds a chosen offer as a line: to the deal, or, with
 * `onAdd`, wherever the caller wants (a project BOQ section). The cost is read again on the server when "Add" is pressed;
 * this list is only for choosing.
 */
export function FindPrice({
  dealId,
  onAdd,
  defaultMargin,
  initialQuery,
  trigger,
  title = "Find a supplier price",
}: {
  dealId?: number;
  onAdd?: (offerId: number, qty: number, marginPct: number) => Promise<unknown>;
  defaultMargin: number;
  initialQuery: string;
  /** The button that opens it, shown with a search icon (default: an outline "Find price" button). */
  trigger?: React.ReactElement;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(initialQuery);
  const [qty, setQty] = useState("1");
  const [margin, setMargin] = useState(String(defaultMargin));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sales/prices?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error(res.status === 403 ? "You need the Procurement app to see supplier prices." : "Could not search the prices.");
        const data = (await res.json()) as { products: Product[] };
        if (mine === seq.current) {
          setProducts(data.products);
          setError("");
        }
      } catch (e) {
        if (mine === seq.current) setError((e as Error).message);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open]);

  const searching = q.trim().length >= 2;
  const shown = searching ? products : [];
  const n = Math.max(1, Math.floor(Number(qty)) || 1);
  const m = Number.isFinite(Number(margin)) && margin.trim() !== "" ? Math.max(0, Number(margin)) : defaultMargin;

  const add = (o: Offer, label: string) =>
    start(async () => {
      try {
        if (onAdd) await onAdd(o.id, n, m);
        else if (dealId) await addItemFromOffer(dealId, o.id, n, m);
        toast.success(`Added ${n} × ${label.slice(0, 40)}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger}>
          <Search />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Search /> Find price
        </DialogTrigger>
      )}
      <DialogContent className="flex max-h-[85svh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Search the price lists, then add the offer you want to quote. The price is cost plus your margin.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-48 flex-1 gap-1">
            <Label htmlFor="fp-q" className="text-xs">
              Search
            </Label>
            <Input id="fp-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. latitude 5450 i5 16gb" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="fp-qty" className="text-xs">
              Quantity
            </Label>
            <Input id="fp-qty" className="w-20" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="fp-margin" className="text-xs">
              Margin %
            </Label>
            <Input id="fp-margin" className="w-20" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
          </div>
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={`/procurement/compare?q=${encodeURIComponent(q)}`} target="_blank" />} aria-label="Open in Compare" title="Open in Compare (new tab)">
            <ExternalLink />
          </Button>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto rounded-lg border" aria-live="polite">
          {error && <p className="p-3 text-sm text-destructive">{error}</p>}
          {!error && !searching && <p className="p-3 text-sm text-muted-foreground">Type at least two letters: a brand, a model or a part number.</p>}
          {!error && searching && !loading && !shown.length && <p className="p-3 text-sm text-muted-foreground">No prices found. Try fewer words, or add the line by hand.</p>}
          {searching && loading && <p className="p-3 text-sm text-muted-foreground">Searching…</p>}
          {shown.map((p) => (
            <div key={p.id} className="border-b last:border-b-0">
              <div className="bg-muted/50 px-3 py-1.5">
                <div className="text-sm font-medium">{p.label}</div>
                {p.spec && <div className="truncate text-xs text-muted-foreground">{p.spec}</div>}
              </div>
              {p.offers.map((o) => {
                const usable = o.price != null && o.priceAed != null;
                return (
                  <div key={o.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm ${o.stale ? "opacity-60" : ""}`}>
                    <div className="min-w-32 flex-1">
                      <span className="font-medium">{o.supplier}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{ago(o.receivedAt)}</span>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {o.best && <Badge variant="secondary">Best price</Badge>}
                        {o.stale && <Badge variant="outline">Old</Badge>}
                        {o.basis && <Badge variant="outline">{o.basis}</Badge>}
                        {o.stock && <span className="truncate">{o.stock}</span>}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-medium">{o.price != null ? money(o.price, o.currency) : "On request"}</div>
                      {usable && o.currency !== "AED" && <div className="text-xs text-muted-foreground">≈ {money(o.priceAed, "AED")}</div>}
                    </div>
                    <div className="w-28 text-right text-xs text-muted-foreground tabular-nums">{usable ? `Sell ${money(sellPrice(o.priceAed!, m), "AED")}` : ""}</div>
                    <Button size="sm" pending={pending} disabled={!usable} onClick={() => add(o, p.label)} title={usable ? "Add this line" : "No AED price: add the line by hand"}>
                      <Plus /> Add
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
