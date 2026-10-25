"use client";

import { Ban, HandCoins, Pencil, Plus, Receipt, Save, Trash2, Undo2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createBill,
  createExpense,
  createSupplierFromAccounts,
  recordSupplierPayment,
  updateSupplierBilling,
  voidBill,
  voidSupplierPayment,
} from "@/app/(app)/accounts/purchase-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dubaiToday } from "@/lib/dates";
import { dueDateFor, PAYMENT_METHODS, termsLabel, TERMS_OPTIONS } from "@/lib/invoicing";
import { billTotals, CATEGORIES, lineCost } from "@/lib/purchases";
import { longDay, money } from "@/lib/quotation";

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
        toast.error((e as Error).message);
      }
    });
  return [pending, run, router] as const;
}

const num = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export interface SupplierOption {
  id: number;
  name: string;
  termsDays: number;
}
export interface OrderOption {
  id: number;
  number: string;
  companyName: string;
}

function MethodToggle({ value, onChange }: { value: "cash" | "bank"; onChange: (v: "cash" | "bank") => void }) {
  return (
    <div className="inline-flex w-fit rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="Paid by">
      {PAYMENT_METHODS.map((m) => (
        <button
          key={m.key}
          type="button"
          role="radio"
          aria-checked={value === m.key}
          onClick={() => onChange(m.key)}
          className={`h-7 rounded-md px-3 text-xs font-medium ${value === m.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function TermsSelect({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  const options: number[] = TERMS_OPTIONS.includes(value as (typeof TERMS_OPTIONS)[number]) ? [...TERMS_OPTIONS] : [...TERMS_OPTIONS, value].sort((a, b) => a - b);
  return (
    <NativeSelect id={id} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((t) => (
        <NativeSelectOption key={t} value={String(t)}>
          {t === 0 ? "Cash / on receipt" : `${t} days`}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function CategorySelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {CATEGORIES.map((c) => (
        <NativeSelectOption key={c.key} value={c.key}>
          {c.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function OrderSelect({ id, value, onChange, orders }: { id: string; value: string; onChange: (v: string) => void; orders: OrderOption[] }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <NativeSelectOption value="">Not for a customer order</NativeSelectOption>
      {orders.map((o) => (
        <NativeSelectOption key={o.id} value={String(o.id)}>
          {o.number} · {o.companyName}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Supplier picker with "add a new one" (a bill from someone Procurement never had). */
function SupplierSelect({ id, value, onChange, suppliers, allowNone }: { id: string; value: string; onChange: (v: string, s?: SupplierOption) => void; suppliers: SupplierOption[]; allowNone?: string }) {
  const [list, setList] = useState(suppliers);
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1.5">
      <NativeSelect id={id} className="min-w-0 flex-1" value={value} onChange={(e) => onChange(e.target.value, list.find((s) => String(s.id) === e.target.value))}>
        <NativeSelectOption value="">{allowNone ?? "Pick the supplier"}</NativeSelectOption>
        {list.map((s) => (
          <NativeSelectOption key={s.id} value={String(s.id)}>
            {s.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        type="button"
        variant="outline"
        size="icon"
        title="Add a supplier that is not in the list"
        aria-label="Add a supplier"
        pending={pending}
        onClick={() => {
          const name = prompt("New supplier name (as on their invoice):")?.trim();
          if (!name) return;
          start(async () => {
            try {
              const newId = await createSupplierFromAccounts({ name });
              const s = { id: newId, name, termsDays: 30 };
              setList([...list, s].sort((a, b) => a.name.localeCompare(b.name)));
              onChange(String(newId), s);
              toast.success("Supplier added");
            } catch (e) {
              toast.error((e as Error).message);
            }
          });
        }}
      >
        <Plus />
      </Button>
    </div>
  );
}

type Line = { description: string; qty: string; unitCost: string };

/** The new-bill page: who, their invoice number, dates, the lines, VAT, and the customer order it was bought for. */
export function BillForm({ suppliers, orders, preset }: { suppliers: SupplierOption[]; orders: OrderOption[]; preset: { orderId?: number; kind?: "bill" | "opening" } }) {
  const [pending, run, router] = useRun();
  const today = dubaiToday();
  const [kind, setKind] = useState<"bill" | "opening">(preset.kind ?? "bill");
  const [supplierId, setSupplierId] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [termsDays, setTermsDays] = useState(30);
  const [orderId, setOrderId] = useState(preset.orderId ? String(preset.orderId) : "");
  const [category, setCategory] = useState(preset.orderId ? "cogs" : "cogs");
  const [vatPct, setVatPct] = useState(5);
  const [vatOverride, setVatOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: "1", unitCost: "" }]);
  const opening = kind === "opening";
  const parsed = lines.map((l) => ({ description: l.description.trim(), qty: num(l.qty), unitCost: num(l.unitCost) })).filter((l) => l.description && l.qty > 0);
  const t = opening ? billTotals(parsed, 0, 0) : billTotals(parsed, vatPct, vatOverride.trim() ? num(vatOverride) : null);
  const set = (i: number, k: keyof Line, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const can = !!supplierId && parsed.length > 0 && t.total > 0 && (opening || !!supplierRef.trim());

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            createBill({
              kind,
              supplierId: Number(supplierId),
              supplierRef: supplierRef.trim(),
              billDate,
              termsDays,
              category,
              orderId: orderId ? Number(orderId) : null,
              lines: parsed,
              vatPct,
              vatAmount: !opening && vatOverride.trim() ? num(vatOverride) : null,
              notes,
            }),
          "Bill saved",
          (r) => router.replace(`/accounts/bills/${(r as { id: number }).id}`),
        );
      }}
    >
      <div className="inline-flex w-fit rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="What is it">
        {(
          [
            ["bill", "Supplier bill"],
            ["opening", "Unpaid from before (opening balance)"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`h-7 rounded-md px-3 text-xs font-medium ${kind === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="b-sup">Supplier</Label>
          <SupplierSelect
            id="b-sup"
            value={supplierId}
            suppliers={suppliers}
            onChange={(v, s) => {
              setSupplierId(v);
              if (s) setTermsDays(s.termsDays);
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="b-ref">Their invoice no.{opening ? "" : " (required)"}</Label>
          <Input id="b-ref" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} maxLength={60} placeholder="as printed on the bill" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="b-date">Bill date</Label>
          <Input id="b-date" type="date" max={today} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="b-terms">Pay within</Label>
          <TermsSelect id="b-terms" value={termsDays} onChange={setTermsDays} />
          <span className="text-xs text-muted-foreground">Due {longDay(dueDateFor(billDate, termsDays))}</span>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="b-cat">Category</Label>
          <CategorySelect id="b-cat" value={category} onChange={setCategory} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="b-order">Bought for customer order</Label>
          <OrderSelect
            id="b-order"
            value={orderId}
            orders={orders}
            onChange={(v) => {
              setOrderId(v);
              if (v) setCategory("cogs");
            }}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="hidden grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
          <span>{opening ? "What is still owed (one line is enough)" : "Item"}</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit cost</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_4rem_6rem_2rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_2rem]">
            <Input aria-label="Description" value={l.description} onChange={(e) => set(i, "description", e.target.value)} placeholder={opening ? `Opening balance ${supplierRef}`.trim() : "e.g. Lenovo E14 laptops"} />
            <Input aria-label="Quantity" inputMode="decimal" className="text-right" value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} />
            <Input aria-label="Unit cost before VAT" inputMode="decimal" className="text-right" value={l.unitCost} onChange={(e) => set(i, "unitCost", e.target.value)} placeholder="AED" />
            <span className="hidden text-right text-sm tabular-nums sm:block">{money(lineCost({ qty: num(l.qty), unitCost: num(l.unitCost) }))}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setLines([...lines, { description: "", qty: "1", unitCost: "" }])}>
          <Plus /> Line
        </Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid w-full max-w-md gap-1.5">
          <Label htmlFor="b-notes">Note</Label>
          <Textarea id="b-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="optional" />
        </div>
        <div className="ml-auto grid w-full max-w-80 gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{money(t.subtotal)}</span>
          </div>
          {!opening && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                VAT
                <NativeSelect size="sm" aria-label="VAT rate" value={String(vatPct)} onChange={(e) => setVatPct(Number(e.target.value))}>
                  <NativeSelectOption value="5">5%</NativeSelectOption>
                  <NativeSelectOption value="0">0% / no VAT</NativeSelectOption>
                </NativeSelect>
              </span>
              <Input aria-label="VAT amount on their invoice" title="Type the VAT amount only when their invoice shows a different figure" inputMode="decimal" className="h-7 w-28 text-right" value={vatOverride} onChange={(e) => setVatOverride(e.target.value)} placeholder={String(t.vatAmount)} />
            </div>
          )}
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(t.total)}</span>
          </div>
          <Button type="submit" className="mt-2" pending={pending} disabled={!can}>
            <Save /> Save bill
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Money spent on the spot: the expense and its payment in one step. */
export function ExpenseDialog({ suppliers, orders }: { suppliers: SupplierOption[]; orders: OrderOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const blank = { paidOn: dubaiToday(), category: "transport", supplierId: "", paidTo: "", description: "", amount: "", vatPct: 0, method: "cash" as "cash" | "bank", reference: "", orderId: "", notes: "" };
  const [f, setF] = useState(blank);
  const t = billTotals([{ qty: 1, unitCost: num(f.amount) }], f.vatPct);
  const can = num(f.amount) > 0 && f.description.trim().length >= 2 && (!!f.supplierId || !!f.paidTo.trim()) && (f.method === "cash" || !!f.reference.trim());
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(blank);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <HandCoins /> New expense
          </Button>
        }
      />
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New expense</DialogTitle>
          <DialogDescription>Paid on the spot. For a supplier invoice paid later, use Bills.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ex-date">Date paid</Label>
            <Input id="ex-date" type="date" max={dubaiToday()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ex-cat">Category</Label>
            <CategorySelect id="ex-cat" value={f.category} onChange={(v) => setF({ ...f, category: v })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ex-sup">Paid to</Label>
          <SupplierSelect id="ex-sup" value={f.supplierId} suppliers={suppliers} allowNone="Not a supplier: type the name below" onChange={(v) => setF({ ...f, supplierId: v })} />
          {!f.supplierId && <Input aria-label="Who was paid" value={f.paidTo} onChange={(e) => setF({ ...f, paidTo: e.target.value })} placeholder="e.g. ENOC, DEWA, landlord, staff name" maxLength={120} />}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ex-desc">What for</Label>
          <Input id="ex-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Fuel for delivery van, October" maxLength={300} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ex-amt">Amount before VAT</Label>
            <Input id="ex-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="AED" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ex-vat">VAT on the receipt</Label>
            <NativeSelect id="ex-vat" value={String(f.vatPct)} onChange={(e) => setF({ ...f, vatPct: Number(e.target.value) })}>
              <NativeSelectOption value="0">No VAT</NativeSelectOption>
              <NativeSelectOption value="5">5% (tax invoice with TRN)</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Paid by · total {money(t.total)}</span>
          <MethodToggle value={f.method} onChange={(m) => setF({ ...f, method: m })} />
        </div>
        {f.method === "bank" && (
          <div className="grid gap-1.5">
            <Label htmlFor="ex-ref">Bank reference (required)</Label>
            <Input id="ex-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="transfer / FT number" maxLength={120} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="ex-order">For customer order (optional)</Label>
          <OrderSelect id="ex-order" value={f.orderId} orders={orders} onChange={(v) => setF({ ...f, orderId: v })} />
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!can}
            onClick={() =>
              run(
                () =>
                  createExpense({
                    paidOn: f.paidOn,
                    category: f.category,
                    supplierId: f.supplierId ? Number(f.supplierId) : null,
                    paidTo: f.paidTo,
                    description: f.description,
                    amount: num(f.amount),
                    vatPct: f.vatPct,
                    method: f.method,
                    reference: f.reference,
                    orderId: f.orderId ? Number(f.orderId) : null,
                    notes: f.notes,
                  }),
                "Expense saved",
                () => setOpen(false),
              )
            }
          >
            <Save /> Save expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PayBillDialog({ billId, number, balance, billDate }: { billId: number; number: string; balance: number; billDate: string }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [f, setF] = useState({ paidOn: dubaiToday(), amount: String(balance), method: "bank" as "cash" | "bank", reference: "", notes: "" });
  const amount = num(f.amount);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Wallet /> Pay
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {number}</DialogTitle>
          <DialogDescription>Still to pay: {money(balance)}. A part payment leaves the rest open.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pb-amount">Amount (AED)</Label>
            <Input id="pb-amount" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pb-date">Date paid</Label>
            <Input id="pb-date" type="date" min={billDate} max={dubaiToday()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Paid by</span>
          <MethodToggle value={f.method} onChange={(m) => setF({ ...f, method: m })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pb-ref">{f.method === "bank" ? "Bank reference (required)" : "Reference"}</Label>
          <Input id="pb-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder={f.method === "bank" ? "transfer / FT number" : "optional"} maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pb-notes">Note</Label>
          <Input id="pb-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="optional" maxLength={500} />
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!(amount > 0) || amount > balance + 0.001 || (f.method === "bank" && !f.reference.trim())}
            onClick={() => run(() => recordSupplierPayment(billId, { ...f, amount }), "Payment saved", () => setOpen(false))}
          >
            <Receipt /> Save payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VoidSupplierPaymentButton({ paymentId, number }: { paymentId: number; number: string }) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Void payment ${number}`}
      title="Void this payment (entered by mistake)"
      pending={pending}
      onClick={() => {
        const why = prompt(`Void ${number}? It stays on record, crossed out. Why?`);
        if (why) run(() => voidSupplierPayment(paymentId, why), "Payment voided");
      }}
    >
      <Undo2 />
    </Button>
  );
}

export function VoidBillButton({ billId, number, expense }: { billId: number; number: string; expense: boolean }) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="outline"
      size="sm"
      title={expense ? "Void this expense and its payment (entered by mistake)" : "Void this bill (entered by mistake). Void its payments first."}
      pending={pending}
      onClick={() => {
        const why = prompt(`Void ${number}? It stays on record, crossed out, and leaves every total. Why?`);
        if (why) run(() => voidBill(billId, why), `${number} voided`);
      }}
    >
      <Ban /> Void
    </Button>
  );
}

export interface SupplierBilling {
  id: number;
  name: string;
  trn: string;
  email: string;
  address: string;
  termsDays: number;
  bankName: string;
  iban: string;
}

/** What Accounts needs to pay a supplier: TRN, address, credit terms and bank details. */
export function SupplierBillingDialog({ supplier }: { supplier: SupplierBilling }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [f, setF] = useState(supplier);
  const set = (k: keyof SupplierBilling) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(supplier);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title="TRN, address, credit terms and bank details">
            <Pencil /> Billing details
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier.name}</DialogTitle>
          <DialogDescription>Name, contact and prices are kept in Procurement.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="sb-trn">TRN</Label>
            <Input id="sb-trn" value={f.trn} onChange={set("trn")} maxLength={30} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sb-terms">We pay within</Label>
            <TermsSelect id="sb-terms" value={f.termsDays} onChange={(v) => setF({ ...f, termsDays: v })} />
            <span className="text-xs text-muted-foreground">{termsLabel(f.termsDays)}</span>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="sb-email">Accounts email</Label>
            <Input id="sb-email" type="email" value={f.email} onChange={set("email")} maxLength={200} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="sb-addr">Address</Label>
            <Textarea id="sb-addr" rows={2} value={f.address} onChange={set("address")} maxLength={300} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sb-bank">Bank</Label>
            <Input id="sb-bank" value={f.bankName} onChange={set("bankName")} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sb-iban">IBAN</Label>
            <Input id="sb-iban" value={f.iban} onChange={set("iban")} maxLength={40} />
          </div>
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            onClick={() => run(() => updateSupplierBilling(supplier.id, { trn: f.trn, email: f.email, address: f.address, termsDays: f.termsDays, bankName: f.bankName, iban: f.iban }), "Supplier details saved", () => setOpen(false))}
          >
            <Save /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
