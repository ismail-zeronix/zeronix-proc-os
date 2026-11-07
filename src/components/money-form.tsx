"use client";

import { Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createReceipt, customerOpenItems } from "@/app/(app)/accounts/actions";
import { createVoucher, supplierOpenItems } from "@/app/(app)/accounts/purchase-actions";
import { AccountPicker, pickedAccount, type BankOption } from "@/components/account-picker";
import { BackButton } from "@/components/back-button";
import { CustomerPicker, NewSupplierDialog, type PickedCustomer } from "@/components/party-pickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dubaiToday } from "@/lib/dates";
import { PAYMENT_METHODS } from "@/lib/invoicing";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { longDay, money } from "@/lib/quotation";
import { errorText } from "@/lib/user-error";

export interface OpenItem {
  id: number;
  number: string;
  supplierRef?: string;
  issueDate: string;
  dueDate: string;
  total: number;
  balance: number;
  label: string;
}

const num = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Money in from a customer (a receipt) or out to a supplier (a voucher). Pick who, type the amount and tick what it pays:
 * ticking fills the document from what is left. Anything not used stays as an advance, to apply later.
 */
export function MoneyForm({ party, initial, suppliers, preselect, accounts }: { party: "customer" | "supplier"; initial: PickedCustomer | null; suppliers?: { id: number; name: string; termsDays: number }[]; /** A document to tick straight away. */ preselect?: number; accounts: BankOption[] }) {
  const router = useRouter();
  const customer = party === "customer";
  const [pending, start] = useTransition();
  const [who, setWho] = useState<PickedCustomer | null>(initial);
  const [list, setList] = useState(suppliers ?? []);
  const [items, setItems] = useState<OpenItem[]>([]);
  const [advance, setAdvance] = useState(0);
  const [paidOn, setPaidOn] = useState(dubaiToday());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank">("bank");
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [ticked, setTicked] = useState<Record<number, string>>({});

  const whoId = who?.id;
  useEffect(() => {
    if (!whoId) return;
    let live = true;
    let first = true;
    const load = () =>
      (customer ? customerOpenItems(whoId) : supplierOpenItems(whoId)).then(
        (r) => {
          if (!live) return;
          setItems(r.items);
          setAdvance(r.advance);
          if (first) {
            first = false;
            setTicked({});
            const pre = r.items.find((i) => i.id === preselect);
            if (pre) {
              setTicked({ [pre.id]: String(pre.balance) });
              setAmount((a) => a || String(pre.balance));
            }
            return;
          }
          // read again: keep what was ticked, but never more than is still open
          setTicked((t) => Object.fromEntries(Object.entries(t).flatMap(([id, v]) => {
            const it = r.items.find((i) => i.id === Number(id));
            return it ? [[id, String(Math.min(num(v), it.balance))]] : [];
          })));
        },
        (e) => toast.error(errorText(e)),
      );
    load();
    // a debit note or payment made in another tab shows here as soon as this tab is looked at again
    const again = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [whoId, customer, preselect]);

  const total = num(amount);
  const parts = Object.entries(ticked).map(([id, v]) => ({ id: Number(id), amount: num(v) }));
  const used = fromMinor(sumMinor(parts.map((p) => toMinor(p.amount))));
  const rest = fromMinor(toMinor(total) - toMinor(used));
  const tooMuch = parts.some((p) => {
    const it = items.find((i) => i.id === p.id);
    return !it || p.amount <= 0 || toMinor(p.amount) > toMinor(it.balance);
  });
  const can = !!who && total > 0 && !tooMuch && rest >= 0 && !!paidOn && (method === "cash" || !!reference.trim());

  /** Ticking fills the document from what is left of the amount. With no amount typed yet, the amount follows the ticks. */
  const toggle = (it: OpenItem, on: boolean) => {
    if (!on) {
      const next = { ...ticked };
      delete next[it.id];
      setTicked(next);
      return;
    }
    // when the amount is used up the box stays at 0, marked, so nothing is silently over-allocated
    setTicked({ ...ticked, [it.id]: String(total > 0 ? Math.min(it.balance, Math.max(0, rest)) : it.balance) });
    if (!(total > 0)) setAmount(String(fromMinor(toMinor(used) + toMinor(it.balance))));
  };

  const save = () =>
    start(async () => {
      try {
        const base = { paidOn, amount: total, method, reference, notes, bankAccountId: pickedAccount(accounts, method, bankAccountId) };
        const r = customer
          ? await createReceipt({ ...base, companyId: who!.id, allocations: parts.map((p) => ({ invoiceId: p.id, amount: p.amount })) })
          : await createVoucher({ ...base, supplierId: who!.id, allocations: parts.map((p) => ({ billId: p.id, amount: p.amount })) });
        toast.success(`${customer ? "Receipt" : "Voucher"} ${r.number} saved${r.advance > 0 ? `, ${money(r.advance)} kept as an advance` : ""}`);
        router.replace(customer ? "/accounts/payments" : "/accounts/payments-made");
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback={customer ? "/accounts/payments" : "/accounts/payments-made"} />
        <div className="grid min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-semibold">{customer ? "New receipt" : "New voucher"}</h1>
          <span className="truncate text-xs text-muted-foreground">{customer ? "Money received from a customer" : "Money paid to a supplier"}. Tick what it pays; the rest stays as an advance.</span>
        </div>
        <Button size="sm" pending={pending} disabled={!can} onClick={save}>
          <Save /> Save {customer ? "receipt" : "voucher"}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-3 rounded-xl border bg-card p-3" aria-label="Details">
          <div className="grid gap-1.5">
            <Label htmlFor="mf-who">{customer ? "Customer" : "Supplier"}</Label>
            {customer ? (
              <CustomerPicker id="mf-who" value={who} onChange={setWho} />
            ) : (
              <div className="flex gap-1.5">
                <NativeSelect id="mf-who" className="min-w-0 flex-1" value={who ? String(who.id) : ""} onChange={(e) => setWho(list.find((s) => String(s.id) === e.target.value) ?? null)}>
                  <NativeSelectOption value="">Pick the supplier</NativeSelectOption>
                  {list.map((s) => (
                    <NativeSelectOption key={s.id} value={String(s.id)}>
                      {s.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NewSupplierDialog
                  onAdded={(s) => {
                    setList([...list, s].sort((a, b) => a.name.localeCompare(b.name)));
                    setWho(s);
                  }}
                  trigger={
                    <Button type="button" variant="outline" size="icon" title="Add a new supplier" aria-label="Add a new supplier">
                      <Plus />
                    </Button>
                  }
                />
              </div>
            )}
            {advance > 0 && <span className="text-xs text-muted-foreground">Already has {money(advance)} as an advance. Use Apply advance on the {customer ? "invoice" : "bill"} to spend it.</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mf-amt">Amount (AED)</Label>
              <Input id="mf-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mf-date">{customer ? "Date received" : "Date paid"}</Label>
              <Input id="mf-date" type="date" max={dubaiToday()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Paid by</span>
            <div className="inline-flex w-fit rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="Paid by">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={method === m.key} onClick={() => setMethod(m.key)} className={`h-7 rounded-md px-3 text-xs font-medium ${method === m.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <AccountPicker id="mf-acc" accounts={accounts} method={method} value={bankAccountId} onChange={setBankAccountId} />
          <div className="grid gap-1.5">
            <Label htmlFor="mf-ref">{method === "bank" ? "Bank reference (required)" : "Reference"}</Label>
            <Input id="mf-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "bank" ? "transfer / FT number" : "optional"} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mf-notes">Note</Label>
            <Input id="mf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" maxLength={500} />
          </div>
          <div className="grid gap-1 border-t pt-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{customer ? "Received" : "Paid"}</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Set against {customer ? "invoices" : "bills"}</span>
              <span className="tabular-nums">{money(used)}</span>
            </div>
            <div className={`flex justify-between border-t pt-1 font-semibold ${rest < 0 ? "text-destructive" : ""}`}>
              <span>{rest < 0 ? "Over by" : "Kept as an advance"}</span>
              <span className="tabular-nums">{money(Math.abs(rest))}</span>
            </div>
          </div>
          {rest > 0 && customer && <p className="text-xs text-amber-700 dark:text-amber-400">No VAT is posted on an advance here. In the UAE an advance can create a tax point: ask your accountant how to treat it.</p>}
        </aside>

        <section className="grid content-start overflow-x-auto rounded-xl border bg-card" aria-label={customer ? "Open invoices" : "Unpaid bills"}>
          {!who ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Pick the {customer ? "customer" : "supplier"} to see what is open.</p>
          ) : !items.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing open for {who.name}. Saving keeps all of it as an advance.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-8">
                    <span className="sr-only">Pay</span>
                  </TableHead>
                  <TableHead>{customer ? "Invoice" : "Bill"}</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="w-32 text-right">Pay now</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const on = ticked[it.id] !== undefined;
                  const over = on && (toMinor(num(ticked[it.id])) > toMinor(it.balance) || num(ticked[it.id]) <= 0);
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="py-1.5">
                        <Checkbox aria-label={`Pay ${it.number}`} checked={on} onCheckedChange={(v) => toggle(it, !!v)} />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <span className="font-mono text-sm font-medium">{it.number}</span>
                        <div className="text-xs text-muted-foreground">
                          {longDay(it.issueDate)}
                          {it.supplierRef ? ` · their no. ${it.supplierRef}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="hidden py-1.5 text-xs sm:table-cell">
                        {longDay(it.dueDate)}
                        <div className="text-muted-foreground">{it.label}</div>
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">{money(it.balance)}</TableCell>
                      <TableCell className="py-1.5 text-right">
                        {on && (
                          <Input
                            aria-label={`Amount for ${it.number}`}
                            inputMode="decimal"
                            className={`h-7 text-right ${over ? "border-destructive" : ""}`}
                            value={ticked[it.id]}
                            onChange={(e) => setTicked({ ...ticked, [it.id]: e.target.value })}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
