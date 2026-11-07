"use client";

import { FileCheck2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createInvoice, customerBilling } from "@/app/(app)/accounts/actions";
import { BackButton } from "@/components/back-button";
import { CustomerPicker, type PickedCustomer } from "@/components/party-pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dubaiToday } from "@/lib/dates";
import { dueDateFor, termsLabel, TERMS_OPTIONS } from "@/lib/invoicing";
import { lineTotal, longDay, money } from "@/lib/quotation";
import { docTax, SALES_TAX_CODES, taxCodeOptions } from "@/lib/tax/doc-tax";
import { errorText } from "@/lib/user-error";

type LineKind = "product" | "service";
type Line = { key: number; description: string; lineKind: LineKind; taxCode: string; qty: string; unitPrice: string };
const TAX_OPTIONS = taxCodeOptions(SALES_TAX_CODES);
let nextKey = 1;

const num = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export interface InvoiceFormValues {
  company: PickedCustomer | null;
  address: string;
  trn: string;
  quote: { id: number; number: string } | null;
  termsDays: number;
  vatPct: number;
  lines: { description: string; qty: number; unitPrice: number; lineKind: LineKind }[];
}

/** A tax invoice typed directly, or filled in from a quote. No sales order is needed. */
export function InvoiceForm({ initial, nextNumber, ourTrn }: { initial: InvoiceFormValues; nextNumber: string; /** Without our TRN the invoice cannot be issued. */ ourTrn: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = dubaiToday();
  const [company, setCompany] = useState<PickedCustomer | null>(initial.company);
  const [address, setAddress] = useState(initial.address);
  const [trn, setTrn] = useState(initial.trn);
  const [issueDate, setIssueDate] = useState(today);
  const [termsDays, setTermsDays] = useState(initial.termsDays);
  const [customerRef, setCustomerRef] = useState("");
  const firstCode = initial.vatPct > 0 ? "SR" : "ZR";
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.length ? initial.lines.map((l) => ({ key: nextKey++, description: l.description, lineKind: l.lineKind, taxCode: firstCode, qty: String(l.qty), unitPrice: String(l.unitPrice) })) : [{ key: nextKey++, description: "", lineKind: "product", taxCode: firstCode, qty: "1", unitPrice: "" }],
  );
  const parsed = lines.map((l) => ({ description: l.description.trim(), qty: num(l.qty), unitPrice: num(l.unitPrice), lineKind: l.lineKind, taxCode: l.taxCode as (typeof SALES_TAX_CODES)[number] })).filter((l) => l.description && l.qty > 0);
  const t = docTax(parsed.map((l) => ({ net: lineTotal(l), code: l.taxCode })));
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const can = !!company && !!ourTrn && parsed.length > 0 && t.total > 0 && !!issueDate;
  const pick = (c: PickedCustomer | null) => {
    setCompany(c);
    if (!c) {
      setAddress("");
      setTrn("");
      return;
    }
    start(async () => {
      try {
        const b = await customerBilling(c.id);
        setAddress(b.address);
        setTrn(b.trn);
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  };
  const save = () =>
    start(async () => {
      try {
        const r = await createInvoice({ companyId: company!.id, quoteId: initial.quote?.id ?? null, issueDate, termsDays, customerAddress: address, customerRef, vatPct: t.vatPct, lines: parsed });
        toast.success(`Invoice ${r.number} issued`);
        router.replace(`/accounts/invoices/${r.id}`);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  const terms: number[] = TERMS_OPTIONS.includes(termsDays as (typeof TERMS_OPTIONS)[number]) ? [...TERMS_OPTIONS] : [...TERMS_OPTIONS, termsDays].sort((a, b) => a - b);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/accounts/invoices" />
        <div className="grid min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-semibold">New invoice{initial.quote ? ` from ${initial.quote.number}` : ""}</h1>
          <span className="truncate text-xs text-muted-foreground">Will be {nextNumber}. Once issued it cannot be edited: a mistake is fixed with a credit note.</span>
        </div>
        <Button size="sm" pending={pending} disabled={!can} onClick={save} title={can ? undefined : "Pick the customer and add at least one priced line"}>
          <FileCheck2 /> Issue invoice
        </Button>
      </div>

      {!ourTrn && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">Our TRN is not set. An accountant adds it in Accounts › Settings › VAT registration; a tax invoice must show it.</p>}

      <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-3 rounded-xl border bg-card p-3" aria-label="Customer and terms">
          <div className="grid gap-1.5">
            <Label htmlFor="in-co">Customer</Label>
            <CustomerPicker id="in-co" value={company} onChange={pick} locked={!!initial.quote} />
            {company && !trn && <span className="text-xs text-amber-700 dark:text-amber-400">No TRN saved. Fine if they are not VAT registered.</span>}
            {company && trn && <span className="text-xs text-muted-foreground">TRN {trn}</span>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="in-addr">Address on the invoice</Label>
            <Textarea id="in-addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} placeholder="A tax invoice needs the customer's address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="in-date">Invoice date</Label>
              <Input id="in-date" type="date" max={today} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="in-terms">Credit terms</Label>
              <NativeSelect id="in-terms" value={String(termsDays)} onChange={(e) => setTermsDays(Number(e.target.value))}>
                {terms.map((d) => (
                  <NativeSelectOption key={d} value={String(d)}>
                    {termsLabel(d)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Payment due {issueDate ? longDay(dueDateFor(issueDate, termsDays)) : "-"}</p>
          <div className="grid gap-1.5">
            <Label htmlFor="in-ref">Customer PO / LPO number</Label>
            <Input id="in-ref" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} maxLength={60} placeholder="Optional" />
          </div>
          <div className="grid gap-1 border-t pt-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(t.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT</span>
              <span className="tabular-nums">{money(t.vat)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(t.total)}</span>
            </div>
          </div>
        </aside>

        <section className="grid content-start gap-1.5 rounded-xl border bg-card p-3" aria-label="Lines">
          <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_4.5rem_7rem_7rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
            <span>Item</span>
            <span>Type</span>
            <span>VAT</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_4.5rem_7rem_7rem_2rem]">
              <Input aria-label="Description" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} placeholder="e.g. Lenovo E14 laptop" maxLength={500} />
              <NativeSelect aria-label="Product or service" value={l.lineKind} onChange={(e) => set(l.key, { lineKind: e.target.value as LineKind })}>
                <NativeSelectOption value="product">Product</NativeSelectOption>
                <NativeSelectOption value="service">Service</NativeSelectOption>
              </NativeSelect>
              <NativeSelect aria-label="VAT code" title={TAX_OPTIONS.find((o) => o.code === l.taxCode)?.hint} value={l.taxCode} onChange={(e) => set(l.key, { taxCode: e.target.value })}>
                {TAX_OPTIONS.map((o) => (
                  <NativeSelectOption key={o.code} value={o.code}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Input aria-label="Quantity" inputMode="decimal" className="text-right" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} />
              <Input aria-label="Unit price before VAT" inputMode="decimal" className="text-right" value={l.unitPrice} onChange={(e) => set(l.key, { unitPrice: e.target.value })} placeholder="AED" />
              <span className="text-right text-sm tabular-nums">{money(lineTotal({ qty: num(l.qty), unitPrice: num(l.unitPrice) }))}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="mt-1 w-fit" onClick={() => setLines((ls) => [...ls, { key: nextKey++, description: "", lineKind: "product", taxCode: ls.at(-1)?.taxCode ?? firstCode, qty: "1", unitPrice: "" }])}>
            <Plus /> Line
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Products and services post to their own sales accounts. Prices are before VAT. Exports outside the GCC are zero-rated.</p>
        </section>
      </div>
    </div>
  );
}
