"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { checkDoc, termsChoices, type DraftLine, type DraftPaid } from "@/lib/import/docs";
import { termsLabel } from "@/lib/invoicing";
import { parseAmount } from "@/lib/ledger/opening";
import { CATEGORIES } from "@/lib/purchases";
import { money } from "@/lib/quotation";
import { PURCHASE_TAX_CODES, SALES_TAX_CODES, taxCodeOptions } from "@/lib/tax/doc-tax";
import type { ImportContext, UiDoc } from "./types";

const INVOICE_CODES = taxCodeOptions(SALES_TAX_CODES);
const BILL_CODES = taxCodeOptions(PURCHASE_TAX_CODES);

/** A number the person types: keeps what they typed ("1." stays "1.") and gives the parsed number to the table. */
function NumInput({ value, onChange, label, className = "" }: { value: number; onChange: (n: number) => void; label: string; className?: string }) {
  // what is being typed ("1." stays "1.") while the field has focus; otherwise the saved number
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className={`text-right ${className}`}
      value={typing ?? String(value)}
      onChange={(e) => {
        setTyping(e.target.value);
        onChange(parseAmount(e.target.value));
      }}
      onBlur={() => setTyping(null)}
    />
  );
}

export interface BlockFlags {
  exists: boolean;
  duplicate: boolean;
  partyReady: boolean;
  /** The customer or supplier it is mapped to ("" = will be added). */
  partyName: string;
}

interface Props {
  doc: UiDoc;
  flags: BlockFlags;
  ctx: ImportContext;
  collapsed: boolean;
  busy: boolean;
  onToggle: (key: string) => void;
  onDoc: (key: string, patch: Partial<UiDoc>) => void;
  onLine: (key: string, index: number, patch: Partial<DraftLine>) => void;
  onAddLine: (key: string) => void;
  onRemoveLine: (key: string, index: number) => void;
  onPaid: (key: string, patch: Partial<DraftPaid>) => void;
}

/** One invoice or bill of the paste, every field editable, with its total checked against the file. */
export const DocBlock = memo(function DocBlock({ doc, flags, ctx, collapsed, busy, onToggle, onDoc, onLine, onAddLine, onRemoveLine, onPaid }: Props) {
  const inv = doc.kind === "invoice";
  const c = checkDoc(doc, { today: ctx.today, exists: flags.exists, duplicateInBatch: flags.duplicate, partyReady: flags.partyReady, hasOurTrn: ctx.hasOurTrn });
  const done = doc.status === "done";
  const locked = busy || done || doc.status === "running";
  const ready = c.errors.length === 0 && !done;
  const codes = inv ? INVOICE_CODES : BILL_CODES;
  const cols = inv ? "sm:grid-cols-[minmax(0,1fr)_6rem_8.5rem_4.5rem_7rem_6.5rem_2rem]" : "sm:grid-cols-[minmax(0,1fr)_8.5rem_4.5rem_7rem_6.5rem_2rem]";
  const banks = ctx.banks.filter((b) => (doc.paid.method === "cash" ? b.kind === "cash" || b.kind === "petty" : b.kind !== "cash" && b.kind !== "petty"));
  const tone = done ? "border-emerald-500/40 bg-emerald-500/5" : doc.status === "failed" ? "border-red-500/50" : c.errors.length ? "border-amber-500/40" : "";

  return (
    <section className={`grid gap-2 rounded-lg border bg-card p-2.5 ${tone}`} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 220px" }} aria-label={`${inv ? "Invoice" : "Bill"} ${doc.number}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Checkbox aria-label={`Include ${doc.number}`} checked={doc.ticked && ready} disabled={!ready || locked} onCheckedChange={(v) => onDoc(doc.key, { ticked: !!v })} />
        <Button type="button" variant="ghost" size="icon-xs" aria-label={collapsed ? "Show lines" : "Hide lines"} onClick={() => onToggle(doc.key)}>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        <Input aria-label={inv ? "Invoice number" : "Supplier invoice number"} className="w-44 font-mono" value={doc.number} disabled={locked} onChange={(e) => onDoc(doc.key, { number: e.target.value })} />
        <Input aria-label="Date" type="date" className="w-36" max={ctx.today} value={doc.date} disabled={locked} onChange={(e) => onDoc(doc.key, { date: e.target.value })} />
        <NativeSelect aria-label="Credit terms" className="w-40" value={String(doc.termsDays)} disabled={locked} onChange={(e) => onDoc(doc.key, { termsDays: Number(e.target.value) })}>
          {termsChoices(doc.termsDays).map((d) => (
            <NativeSelectOption key={d} value={String(d)}>
              {termsLabel(d)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="inline-flex min-w-0 max-w-64 items-center gap-1 truncate text-sm font-medium" title={flags.partyName || doc.party}>
          {flags.partyName ? flags.partyName : (
            <>
              <UserPlus className="size-3.5 shrink-0 text-amber-600" />
              <span className="truncate">{doc.party || "No name"}</span>
              <span className="text-xs font-normal text-amber-700 dark:text-amber-400">new</span>
            </>
          )}
        </span>
        <span className="ml-auto flex items-center gap-3 text-sm">
          <span className="tabular-nums text-muted-foreground">VAT {money(c.tax.vat)}</span>
          <span className="font-semibold tabular-nums">{money(c.tax.total)}</span>
          {done ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> Saved
              {doc.result && (
                <Link className="inline-flex items-center gap-0.5 font-mono underline" target="_blank" href={inv ? `/accounts/invoices/${doc.result.id}` : `/accounts/bills/${doc.result.id}`}>
                  {doc.result.number} <ExternalLink className="size-3" />
                </Link>
              )}
              {doc.result?.paymentNumber && <span className="font-mono text-muted-foreground">{doc.result.paymentNumber}</span>}
            </span>
          ) : doc.status === "running" ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Saving…
            </span>
          ) : null}
        </span>
      </div>

      {doc.status === "failed" && <p className="rounded-md bg-red-500/10 px-2 py-1 text-sm text-red-700 dark:text-red-400">{doc.message}</p>}
      {!done && c.errors.length > 0 && (
        <ul className="grid gap-0.5 text-xs text-amber-800 dark:text-amber-300">
          {c.errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {e}
            </li>
          ))}
        </ul>
      )}

      {!collapsed && (
        <>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
            {inv ? (
              <Input aria-label="Billing address" placeholder="Billing address (printed on the invoice)" value={doc.address} disabled={locked} onChange={(e) => onDoc(doc.key, { address: e.target.value })} />
            ) : (
              <NativeSelect aria-label="Category" value={doc.category} disabled={locked} onChange={(e) => onDoc(doc.key, { category: e.target.value })}>
                {CATEGORIES.map((k) => (
                  <NativeSelectOption key={k.key} value={k.key}>
                    {k.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            <Input aria-label={inv ? "Customer PO or subject" : "Notes"} placeholder={inv ? "Customer PO / subject" : "Notes"} value={doc.ref} disabled={locked} onChange={(e) => onDoc(doc.key, { ref: e.target.value })} />
            <NativeSelect aria-label="Amounts in the file" className="w-44" value={doc.basis} disabled={locked} onChange={(e) => onDoc(doc.key, { basis: e.target.value as "net" | "gross" })}>
              <NativeSelectOption value="net">Amounts before VAT</NativeSelectOption>
              <NativeSelectOption value="gross">Amounts include VAT</NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="grid gap-1.5">
            <div className={`hidden gap-2 text-xs text-muted-foreground sm:grid ${cols}`}>
              <span>Item</span>
              {inv && <span>Type</span>}
              <span>VAT</span>
              <span className="text-right">Qty</span>
              <span className="text-right">{doc.basis === "gross" ? "Price incl. VAT" : "Unit price"}</span>
              <span className="text-right">Net</span>
              <span />
            </div>
            {doc.lines.map((l, i) => (
              <div key={i} className={`grid items-start gap-2 ${cols}`}>
                <Textarea aria-label="Description" rows={1} className="min-h-8 resize-y py-1 text-sm" value={l.description} disabled={locked} onChange={(e) => onLine(doc.key, i, { description: e.target.value })} />
                {inv && (
                  <NativeSelect aria-label="Product or service" value={l.kind} disabled={locked} onChange={(e) => onLine(doc.key, i, { kind: e.target.value as "product" | "service" })}>
                    <NativeSelectOption value="product">Product</NativeSelectOption>
                    <NativeSelectOption value="service">Service</NativeSelectOption>
                  </NativeSelect>
                )}
                <NativeSelect aria-label="VAT code" title={codes.find((o) => o.code === l.taxCode)?.hint} value={l.taxCode} disabled={locked} onChange={(e) => onLine(doc.key, i, { taxCode: e.target.value })}>
                  {codes.map((o) => (
                    <NativeSelectOption key={o.code} value={o.code}>
                      {o.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <fieldset disabled={locked} className="contents">
                  <NumInput label="Quantity" value={l.qty} onChange={(n) => onLine(doc.key, i, { qty: n })} />
                  <NumInput label={doc.basis === "gross" ? "Price including VAT" : "Unit price before VAT"} value={l.price} onChange={(n) => onLine(doc.key, i, { price: n })} />
                </fieldset>
                <span className="self-center text-right text-sm tabular-nums">{money(c.lines[i]?.net ?? 0)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" disabled={locked || doc.lines.length === 1} onClick={() => onRemoveLine(doc.key, i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="xs" className="w-fit" disabled={locked} onClick={() => onAddLine(doc.key)}>
              <Plus /> Line
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2 text-sm">
            <span className="text-muted-foreground">
              Net <span className="tabular-nums text-foreground">{money(c.tax.subtotal)}</span>
            </span>
            <span className="text-muted-foreground">
              VAT <span className="tabular-nums text-foreground">{money(c.tax.vat)}</span>
            </span>
            <span className="font-medium">
              Total <span className="tabular-nums">{money(c.tax.total)}</span>
            </span>
            {doc.csvTotal != null && (
              <span className={c.difference != null && Math.abs(c.difference) > 0.005 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                File says <span className="tabular-nums">{money(doc.csvTotal)}</span>
                {c.difference != null && Math.abs(c.difference) > 0.005 && (
                  <label className="ml-2 inline-flex cursor-pointer items-center gap-1 text-xs">
                    <Checkbox checked={doc.acceptDiff} disabled={locked} onCheckedChange={(v) => onDoc(doc.key, { acceptDiff: !!v })} /> accept difference
                  </label>
                )}
              </span>
            )}
            {!inv && c.tax.parts.some((p) => p.code === "SR") && (
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                VAT on their invoice
                <Input aria-label="VAT printed on the supplier's invoice" className="h-7 w-24 text-right" inputMode="decimal" placeholder="auto" disabled={locked} value={doc.vatOverride ?? ""} onChange={(e) => onDoc(doc.key, { vatOverride: e.target.value.trim() === "" ? null : parseAmount(e.target.value) })} />
              </label>
            )}
            {c.warnings.map((w) => (
              <span key={w} className="text-xs text-amber-700 dark:text-amber-400">
                {w}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <Checkbox checked={doc.paid.on} disabled={locked} onCheckedChange={(v) => onPaid(doc.key, { on: !!v, amount: doc.paid.amount || c.tax.total, date: doc.paid.date || doc.date })} />
              {inv ? "Already paid (also records the receipt)" : "Already paid (also records the payment)"}
            </label>
            {doc.paid.on && (
              <>
                <fieldset disabled={locked} className="contents">
                  <NumInput label="Amount paid" className="w-28" value={doc.paid.amount} onChange={(n) => onPaid(doc.key, { amount: n })} />
                </fieldset>
                <Input aria-label="Payment date" type="date" className="w-36" max={ctx.today} value={doc.paid.date} disabled={locked} onChange={(e) => onPaid(doc.key, { date: e.target.value })} />
                <NativeSelect aria-label="Cash or bank" className="w-24" value={doc.paid.method} disabled={locked} onChange={(e) => onPaid(doc.key, { method: e.target.value as "cash" | "bank", bankAccountId: null })}>
                  <NativeSelectOption value="bank">Bank</NativeSelectOption>
                  <NativeSelectOption value="cash">Cash</NativeSelectOption>
                </NativeSelect>
                <NativeSelect aria-label="Account" className="w-44" value={doc.paid.bankAccountId ? String(doc.paid.bankAccountId) : ""} disabled={locked} onChange={(e) => onPaid(doc.key, { bankAccountId: e.target.value ? Number(e.target.value) : null })}>
                  <NativeSelectOption value="">Default account</NativeSelectOption>
                  {banks.map((b) => (
                    <NativeSelectOption key={b.id} value={String(b.id)}>
                      {b.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input aria-label="Payment reference" className="w-40" placeholder="Reference" value={doc.paid.reference} disabled={locked} onChange={(e) => onPaid(doc.key, { reference: e.target.value })} />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
});
