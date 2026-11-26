"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/format";
import type { ProductHit } from "@/lib/search";
import { DEFAULT_SHARE_FOOTER, parseTypedPrice, shareText } from "@/lib/share-price";

/** What a ticked product brings into the dialog: its name and specs, and the best supplier offer as a hint. */
const bestOffer = (p: ProductHit) => p.offers.find((o) => o.id === p.bestOfferId) ?? p.offers[0];

/**
 * The customer's WhatsApp text for the ticked products. The salesperson types our price on every line; the best supplier
 * price shows next to it as a reminder only and never goes into the text, nor do supplier names.
 */
export function SharePriceDialog({ products, open, onOpenChange }: { products: ProductHit[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share price</DialogTitle>
          <DialogDescription>Type your price for each product. Supplier names and supplier prices never go into the message.</DialogDescription>
        </DialogHeader>
        {/* mounted only while open: a fresh form every time (never yesterday's prices on today's products) */}
        {open && <ShareForm products={products} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareForm({ products, onClose }: { products: ProductHit[]; onClose: () => void }) {
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [showSpecs, setShowSpecs] = useState(true);
  const [showStock, setShowStock] = useState(true);
  const [footer, setFooter] = useState(DEFAULT_SHARE_FOOTER);
  const [copied, setCopied] = useState(false);

  const lines = products.map((p) => ({
    id: p.id,
    label: p.label,
    specs: p.specSummary.replace(/ \| /g, " · "),
    price: parseTypedPrice(prices[p.id] ?? ""),
    stock: bestOffer(p)?.stockNote ?? "",
    hint: p.bestPrice != null ? `Best supplier price ${money(p.bestPrice, p.bestCurrency ?? "AED")}` : "No supplier price yet",
  }));
  const missing = lines.filter((l) => l.price == null).length;
  const text = shareText(lines, { showSpecs, showStock, currency: "AED", footer });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied. Paste it in WhatsApp.");
    } catch {
      toast.error("Could not copy. Select the text and copy it yourself.");
    }
  };

  return (
    <>
      <div className="grid gap-2">
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{l.label}</div>
              <div className="truncate text-xs text-muted-foreground">{l.hint}</div>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">AED</span>
              <Input
                inputMode="decimal"
                aria-label={`Your price for ${l.label}`}
                value={prices[l.id] ?? ""}
                onChange={(e) => {
                  setCopied(false);
                  setPrices((p) => ({ ...p, [l.id]: e.target.value }));
                }}
                className="pl-10 text-right tabular-nums"
                placeholder="0"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="inline-flex items-center gap-2">
          <Checkbox checked={showSpecs} onCheckedChange={(v) => setShowSpecs(v === true)} /> Specs
        </label>
        <label className="inline-flex items-center gap-2">
          <Checkbox checked={showStock} onCheckedChange={(v) => setShowStock(v === true)} /> Stock note
        </label>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="share-footer">Last line</Label>
        <Input id="share-footer" value={footer} onChange={(e) => setFooter(e.target.value)} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="share-preview">Message</Label>
        <Textarea id="share-preview" readOnly value={text} rows={Math.min(14, text.split("\n").length + 1)} className="font-mono text-xs" />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {missing > 0 && <span className="mr-auto text-xs text-muted-foreground">Type a price for {missing === 1 ? "1 more product" : `${missing} more products`} to copy.</span>}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button disabled={missing > 0} onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy message"}
        </Button>
      </div>
    </>
  );
}
