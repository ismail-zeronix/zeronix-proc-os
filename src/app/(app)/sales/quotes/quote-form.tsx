"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dubaiToday } from "@/lib/dates";
import { termsLabel, TERMS_OPTIONS } from "@/lib/invoicing";
import { marginOf, money, sellPrice, totals } from "@/lib/quotation";
import { customerChoices, offerLine, saveQuote } from "../quote-actions";
import { FindPrice } from "./new/find-price";

type Co = { id: number; name: string };
type Choices = Awaited<ReturnType<typeof customerChoices>>;
type Line = { key: number; description: string; qty: string; cost: string; margin: string; price: string; supplierName: string };

export interface QuoteFormValues {
  id: number | null;
  number: string;
  company: Co | null;
  dealId: number | null;
  contactId: number | null;
  ownerId: number;
  validUntil: string;
  termsDays: number;
  vatPct: number;
  terms: string;
  notes: string;
  lines: { description: string; qty: number; costAed: number | null; unitPriceAed: number; supplierName: string }[];
}

const num = (s: string): number | null => {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const show = (n: number | null | undefined) => (n == null ? "" : String(n));
let nextKey = 1;

/**
 * The quote page, for a new quote and for changing one. Left: who it is for (any customer or lead, with or without a
 * CRM deal), the salesperson it is in the name of, payment terms, validity and VAT. Right: the lines (supplier prices
 * from Procurement or typed by hand, with cost and margin kept inside), then the printed terms and internal notes.
 */
export function QuoteForm({
  initial,
  initialChoices,
  people,
  defaultMargin,
  canFindPrice,
}: {
  initial: QuoteFormValues;
  initialChoices: Choices | null;
  people: { id: number; name: string }[];
  defaultMargin: number;
  canFindPrice: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [company, setCompany] = useState<Co | null>(initial.company);
  const [choices, setChoices] = useState<Choices | null>(initialChoices);
  const [dealId, setDealId] = useState(initial.dealId ? String(initial.dealId) : "");
  const [contactId, setContactId] = useState(initial.contactId ? String(initial.contactId) : "");
  const [ownerId, setOwnerId] = useState(String(initial.ownerId));
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [termsDays, setTermsDays] = useState(initial.termsDays);
  const [vatPct, setVatPct] = useState(initial.vatPct);
  const [terms, setTerms] = useState(initial.terms);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.map((l) => ({
      key: nextKey++,
      description: l.description,
      qty: String(l.qty),
      cost: show(l.costAed),
      margin: show(marginOf(l.costAed, l.unitPriceAed)),
      price: String(l.unitPriceAed),
      supplierName: l.supplierName,
    })),
  );

  // customer search (companies: leads and customers alike)
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const hits = useQuery<{ companies: Co[] }>({
    queryKey: ["quote-company", debounced],
    queryFn: () => fetch(`/api/sales/search?kind=company&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: !company && debounced.length >= 2,
  });

  const pickCompany = (c: Co) =>
    start(async () => {
      try {
        const ch = await customerChoices(c.id);
        setCompany(c);
        setChoices(ch);
        setDealId("");
        setContactId(ch.contacts[0] ? String(ch.contacts[0].id) : "");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  const pickDeal = (id: string) => {
    setDealId(id);
    const d = choices?.deals.find((x) => String(x.id) === id);
    if (d?.contactId) setContactId(String(d.contactId));
    if (d?.ownerId) setOwnerId(String(d.ownerId));
  };

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const onCost = (l: Line, v: string) => {
    const c = num(v);
    const m = num(l.margin) ?? (c != null ? defaultMargin : null);
    setLine(l.key, c != null && m != null ? { cost: v, margin: String(m), price: String(sellPrice(c, m)) } : { cost: v });
  };
  const onMargin = (l: Line, v: string) => {
    const c = num(l.cost);
    const m = num(v);
    setLine(l.key, c != null && m != null ? { margin: v, price: String(sellPrice(c, m)) } : { margin: v });
  };
  const onPrice = (l: Line, v: string) => {
    const p = num(v);
    const m = p != null ? marginOf(num(l.cost), p) : null;
    setLine(l.key, m != null ? { price: v, margin: String(m) } : { price: v });
  };
  const addBlank = () => setLines((ls) => [...ls, { key: nextKey++, description: "", qty: "1", cost: "", margin: "", price: "", supplierName: "" }]);

  const priced = lines
    .map((l) => ({ description: l.description.trim(), qty: Math.max(1, Math.round(num(l.qty) ?? 1)), costAed: num(l.cost), unitPriceAed: num(l.price) ?? 0, supplierName: l.supplierName }))
    .filter((l) => l.description);
  const t = totals(priced.map((l) => ({ qty: l.qty, unitPrice: l.unitPriceAed, cost: l.costAed })), vatPct);
  const profitPct = t.profit != null && t.soldWithCost > 0 ? Math.round((t.profit / t.soldWithCost) * 1000) / 10 : null;
  const can = !!company && priced.length > 0 && priced.every((l) => l.unitPriceAed > 0) && !!ownerId;

  const save = () =>
    start(async () => {
      try {
        const r = await saveQuote(initial.id, {
          companyId: company!.id,
          dealId: dealId ? Number(dealId) : null,
          contactId: contactId ? Number(contactId) : null,
          ownerId: Number(ownerId),
          validUntil,
          termsDays,
          vatPct,
          lines: priced,
          terms,
          notes,
        });
        toast.success(initial.id ? `Quote ${r.number} saved` : `Quote ${r.number} made`);
        router.replace(`/sales/quotes/${r.id}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const label = "text-xs font-medium text-muted-foreground";
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="grid gap-3 rounded-xl border bg-card p-3" aria-label="Customer and terms">
        <div className="grid gap-1.5">
          <Label className={label}>Customer or lead</Label>
          {company ? (
            <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{company.name}</span>
              {!initial.id && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Pick another customer"
                  onClick={() => {
                    setCompany(null);
                    setChoices(null);
                    setDealId("");
                    setContactId("");
                  }}
                >
                  <X />
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-1">
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the company name…" />
              {(hits.data?.companies ?? []).map((c) => (
                <button key={c.id} type="button" className="rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted" onClick={() => pickCompany({ id: c.id, name: c.name })}>
                  {c.name}
                </button>
              ))}
              {debounced.length >= 2 && hits.data && !hits.data.companies.length && <p className="px-1 text-xs text-muted-foreground">Not found. Add the company in CRM first.</p>}
            </div>
          )}
        </div>

        {company && choices && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="qf-deal" className={label}>
                CRM deal
              </Label>
              <NativeSelect id="qf-deal" value={dealId} onChange={(e) => pickDeal(e.target.value)}>
                <NativeSelectOption value="">No deal: instant quote</NativeSelectOption>
                {choices.deals.map((d) => (
                  <NativeSelectOption key={d.id} value={String(d.id)}>
                    {d.title} · {d.stageLabel}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <span className="text-xs text-muted-foreground">Link it when quoting a lead; leave it for a quick quote to a customer.</span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qf-contact" className={label}>
                Contact
              </Label>
              <NativeSelect id="qf-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <NativeSelectOption value="">No contact</NativeSelectOption>
                {choices.contacts.map((c) => (
                  <NativeSelectOption key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.jobTitle ? ` · ${c.jobTitle}` : ""}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="qf-owner" className={label}>
            Salesperson (quote is in their name)
          </Label>
          <NativeSelect id="qf-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {people.map((p) => (
              <NativeSelectOption key={p.id} value={String(p.id)}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="qf-terms" className={label}>
              Payment terms
            </Label>
            <NativeSelect id="qf-terms" value={String(termsDays)} onChange={(e) => setTermsDays(Number(e.target.value))}>
              {TERMS_OPTIONS.map((d) => (
                <NativeSelectOption key={d} value={String(d)}>
                  {termsLabel(d)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qf-valid" className={label}>
              Valid until
            </Label>
            <Input id="qf-valid" type="date" min={dubaiToday()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className={label}>VAT</span>
          <div className="inline-flex w-fit rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="VAT">
            {[
              [5, "Standard 5%"],
              [0, "Zero-rated 0%"],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={vatPct === v}
                onClick={() => setVatPct(v as number)}
                className={`h-7 rounded-md px-3 text-xs font-medium ${vatPct === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-3" aria-label="Lines">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-medium">{initial.number ? `Quote ${initial.number}` : "New quote"}</h2>
          {canFindPrice && (
            <FindPrice
              defaultMargin={defaultMargin}
              initialQuery=""
              onAdd={async (offerId, qty, marginPct) => {
                const l = await offerLine(offerId, qty, marginPct);
                setLines((ls) => [
                  ...ls.filter((x) => x.description.trim() || x.price.trim()),
                  { key: nextKey++, description: l.description, qty: String(l.qty), cost: String(l.costAed), margin: show(marginOf(l.costAed, l.unitPriceAed)), price: String(l.unitPriceAed), supplierName: l.supplierName },
                ]);
              }}
            />
          )}
          <Button variant="outline" size="sm" onClick={addBlank}>
            <Plus /> Add line
          </Button>
        </div>

        <div>
          <div className="hidden grid-cols-[minmax(0,1fr)_4rem_6rem_5rem_6.5rem_6.5rem_2rem] gap-x-2 border-b pb-1 text-xs text-muted-foreground sm:grid">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Margin %</span>
            <span className="text-right">Price</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {lines.map((l) => {
            const q = Math.max(1, Math.round(num(l.qty) ?? 1));
            return (
              <div key={l.key} className="grid grid-cols-4 items-start gap-x-2 gap-y-1 border-b py-1.5 sm:grid-cols-[minmax(0,1fr)_4rem_6rem_5rem_6.5rem_6.5rem_2rem]">
                <div className="col-span-4 sm:col-span-1">
                  <Input aria-label="Item" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="What are we selling?" />
                  {l.supplierName && <div className="mt-0.5 px-1 text-[11px] text-muted-foreground">from {l.supplierName}</div>}
                </div>
                <Input aria-label="Quantity" inputMode="numeric" className="text-right" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                <Input aria-label="Cost per unit (AED)" inputMode="decimal" className="text-right" placeholder="cost" value={l.cost} onChange={(e) => onCost(l, e.target.value)} />
                <Input aria-label="Margin %" inputMode="decimal" className="text-right" placeholder="%" value={l.margin} onChange={(e) => onMargin(l, e.target.value)} />
                <Input aria-label="Selling price per unit (AED)" inputMode="decimal" className="text-right" placeholder="price" value={l.price} onChange={(e) => onPrice(l, e.target.value)} />
                <span className="hidden self-center text-right text-sm font-medium tabular-nums sm:block">{money(q * (num(l.price) ?? 0))}</span>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label="Remove this line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          {!lines.length && <p className="py-6 text-center text-sm text-muted-foreground">{canFindPrice ? "Find a supplier price, or add a line by hand." : "Add a line with the price you will charge."}</p>}
        </div>

        <div className="ml-auto grid w-full max-w-72 gap-0.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{money(t.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">VAT {vatPct}%</span>
            <span className="tabular-nums">{money(t.vat)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(t.total)}</span>
          </div>
          {t.profit != null && (
            <div className="mt-1 flex justify-between text-xs text-muted-foreground" title="Inside the company only: never shown on the quote">
              <span>Profit</span>
              <span className="tabular-nums">
                {money(t.profit)}
                {profitPct != null ? ` · ${profitPct}%` : ""}
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-3 border-t pt-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="qf-tc" className={label}>
              Terms and conditions (printed)
            </Label>
            <Textarea id="qf-tc" rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={4000} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qf-notes" className={label}>
              Notes (inside the company only)
            </Label>
            <Textarea id="qf-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Delivery promise, supplier stock, anything the team should know" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button pending={pending} disabled={!can} onClick={save} title={can ? undefined : "Pick the customer and add at least one priced line"}>
            <Save /> {initial.id ? "Save quote" : "Make quote"}
          </Button>
        </div>
      </section>
    </div>
  );
}
