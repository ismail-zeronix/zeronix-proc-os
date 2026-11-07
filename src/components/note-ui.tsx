"use client";

import { FileMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCreditNote, createDebitNote } from "@/app/(app)/accounts/note-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dubaiToday } from "@/lib/dates";
import { daysBetween } from "@/lib/invoicing";
import { lineTotal, money, round2 } from "@/lib/quotation";
import { noteVat, taxCodeLabel } from "@/lib/tax/doc-tax";
import { errorText } from "@/lib/user-error";

export interface NoteLine {
  id: number;
  description: string;
  qty: number;
  unitPrice: number;
  taxCode: string;
  /** Value still left to give back, before VAT. */
  left: number;
  isProduct: boolean;
}

const num = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * A credit note (customer) or debit note (supplier) for part of a document: a quantity back, or a lower price, per line.
 * The VAT shown here is the server's rule run on the same figures; the server decides.
 */
export function NoteDialog(p: {
  party: "customer" | "supplier";
  documentId: number;
  number: string;
  documentDate: string;
  lines: NoteLine[];
  /** VAT of the document not yet given back. */
  vatLeft: number;
  /** Value of the document before this note, with VAT, less earlier notes. */
  valueLeft: number;
  paid: number;
  /** Cost of the sale's goods in cost of goods sold (customer only). */
  soldCost?: number;
  /** Arrived from New credit note or New debit note: opens by itself. */
  defaultOpen?: boolean;
}) {
  const customer = p.party === "customer";
  const noun = customer ? "credit note" : "debit note";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(!!p.defaultOpen);
  const today = dubaiToday();
  const [date, setDate] = useState(today);
  const [eventDate, setEventDate] = useState(today);
  const [reason, setReason] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [goodsBack, setGoodsBack] = useState(false);
  const [costTyped, setCostTyped] = useState("");
  const [entries, setEntries] = useState<Record<number, { qty: string; price: string }>>({});
  const open_lines = p.lines.filter((l) => l.left > 0);
  const entry = (l: NoteLine) => entries[l.id] ?? { qty: "", price: String(l.unitPrice) };
  const set = (id: number, patch: Partial<{ qty: string; price: string }>, l: NoteLine) => setEntries({ ...entries, [id]: { ...entry(l), ...patch } });
  const picked = open_lines.map((l) => ({ l, qty: num(entry(l).qty), price: num(entry(l).price) })).filter((x) => x.qty > 0 && x.price > 0);
  const parts = picked.map((x) => ({ net: lineTotal({ qty: x.qty, unitPrice: x.price }), code: x.l.taxCode }));
  const over = picked.find((x) => lineTotal({ qty: x.qty, unitPrice: x.price }) > x.l.left);
  const net = round2(parts.reduce((s, x) => s + x.net, 0));
  const standardNet = round2(open_lines.filter((l) => l.taxCode === "SR").reduce((s, l) => s + l.left, 0));
  const vat = noteVat(parts, { standardNet, vat: p.vatLeft });
  const total = round2(net + vat);
  const toAdvance = round2(Math.max(0, p.paid - (p.valueLeft - total)));
  const productNetLeft = open_lines.filter((l) => l.isProduct).reduce((s, l) => s + l.left, 0);
  const productNet = round2(picked.filter((x) => x.l.isProduct).reduce((s, x) => s + lineTotal({ qty: x.qty, unitPrice: x.price }), 0));
  const canBack = customer && (p.soldCost ?? 0) > 0 && productNet > 0;
  const suggested = productNetLeft > 0 ? round2(((p.soldCost ?? 0) * productNet) / productNetLeft) : 0;
  const cost = costTyped.trim() ? num(costTyped) : suggested;
  const lateBy = customer && eventDate && date ? daysBetween(eventDate, date) : 0;
  const can = picked.length > 0 && !over && reason.trim().length >= 3 && !!date && (!customer || (!!eventDate && lateBy >= 0));

  const save = () =>
    start(async () => {
      try {
        const lines = picked.map((x) => ({ itemId: x.l.id, qty: x.qty, unitPrice: x.price }));
        const r = customer
          ? await createCreditNote(p.documentId, { issueDate: date, eventDate, reason, goodsBack: goodsBack && canBack, goodsCost: goodsBack && canBack ? cost : null, lines })
          : await createDebitNote(p.documentId, { issueDate: date, reason, supplierRef, lines });
        toast.success(`${customer ? "Credit" : "Debit"} note ${r.number} saved${r.toAdvance > 0 ? `. ${money(r.toAdvance)} already paid is now an advance` : ""}`);
        setOpen(false);
        // so a reload does not open it again
        if (p.defaultOpen) router.replace(window.location.pathname);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setEntries({});
          setReason("");
          setSupplierRef("");
          setGoodsBack(false);
          setCostTyped("");
          setDate(today);
          setEventDate(today);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title={`Give back part of ${p.number}`}>
            <FileMinus /> {customer ? "Credit note" : "Debit note"}
          </Button>
        }
      />
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {customer ? "Credit note" : "Debit note"} on {p.number}
          </DialogTitle>
          <DialogDescription>Type the quantity going back, or lower the price for a price reduction. The VAT comes back with it.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_6rem_5rem_6.5rem] gap-2 text-xs text-muted-foreground sm:grid">
            <span>Line</span>
            <span className="text-right">Left</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
          </div>
          {open_lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_5rem_6rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_5rem_6.5rem]">
              <span className="col-span-3 grid min-w-0 leading-tight sm:col-span-1">
                <span className="truncate text-sm" title={l.description}>
                  {l.description}
                </span>
                <span className="text-xs text-muted-foreground">
                  {l.qty} × {money(l.unitPrice)} · {taxCodeLabel(l.taxCode)}
                </span>
              </span>
              <button type="button" className="text-right text-sm tabular-nums underline-offset-2 hover:underline" title="Give back all of this line" onClick={() => set(l.id, l.left === lineTotal({ qty: l.qty, unitPrice: l.unitPrice }) ? { qty: String(l.qty), price: String(l.unitPrice) } : { qty: "1", price: String(l.left) }, l)}>
                {money(l.left)}
              </button>
              <Input aria-label={`Quantity of ${l.description}`} inputMode="decimal" className="text-right" placeholder="0" value={entry(l).qty} onChange={(e) => set(l.id, { qty: e.target.value }, l)} />
              <Input aria-label={`Price of ${l.description}`} inputMode="decimal" className="text-right" value={entry(l).price} onChange={(e) => set(l.id, { price: e.target.value }, l)} />
            </div>
          ))}
          {over && <p className="text-sm text-destructive">&quot;{over.l.description}&quot; has only {money(over.l.left)} left.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="n-date">{customer ? "Credit note date" : "Date"}</Label>
            <Input id="n-date" type="date" min={p.documentDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {customer && (
            <div className="grid gap-1.5">
              <Label htmlFor="n-event">Goods returned or price agreed on</Label>
              <Input id="n-event" type="date" min={p.documentDate} max={today} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
          )}
          {lateBy < 0 && <p className="text-sm text-destructive sm:col-span-2">The return date cannot be after the credit note&apos;s date.</p>}
          {lateBy > 14 && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 sm:col-span-2 dark:text-amber-300">This is {lateBy} days after the return. A tax credit note is due within 14 days. You can still save it; it will show in the Tax invoice checks.</p>}
          {!customer && (
            <div className="grid gap-1.5">
              <Label htmlFor="n-ref">Their credit note no.</Label>
              <Input id="n-ref" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} maxLength={60} placeholder="Optional" />
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="n-why">Reason (printed on the {noun})</Label>
            <Input id="n-why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Returned 2 laptops, damaged in transit" />
          </div>
        </div>

        {canBack && (
          <div className="grid gap-2 rounded-lg border p-2.5">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={goodsBack} onCheckedChange={(v) => setGoodsBack(!!v)} />
              <span className="grid leading-tight">
                The goods are coming back
                <span className="text-xs text-muted-foreground">Their cost returns to stock. Leave it off for a price reduction, or when the customer keeps them.</span>
              </span>
            </label>
            {goodsBack && (
              <div className="grid max-w-56 gap-1.5">
                <Label htmlFor="n-cost">What those goods cost us</Label>
                <Input id="n-cost" inputMode="decimal" className="text-right" value={costTyped} onChange={(e) => setCostTyped(e.target.value)} placeholder={String(suggested)} />
              </div>
            )}
          </div>
        )}

        <dl className="ml-auto grid w-full max-w-72 gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Before VAT</dt>
            <dd className="tabular-nums">{money(net)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT</dt>
            <dd className="tabular-nums">{money(vat)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(total)}</dd>
          </div>
        </dl>
        {toAdvance > 0 && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {money(toAdvance)} already paid on {p.number} comes off it and stays as an advance {customer ? "for the customer" : "with the supplier"}, to apply elsewhere or refund.
          </p>
        )}
        <DialogFooter>
          <Button pending={pending} disabled={!can} onClick={save}>
            <FileMinus /> Save {noun}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
