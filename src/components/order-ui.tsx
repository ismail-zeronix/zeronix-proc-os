"use client";

import { Ban, ClipboardCheck, FileCheck2, Pencil, Receipt, Truck, Undo2, Wallet } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelInvoice, issueInvoice, recordPayment, voidPayment } from "@/app/(app)/accounts/actions";
import { cancelOrder, convertQuoteToOrder, markDelivered, updateOrder } from "@/app/(app)/sales/order-actions";
import { AccountPicker, pickedAccount, type BankOption } from "@/components/account-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dubaiToday } from "@/lib/dates";
import { dueDateFor, PAYMENT_METHODS, termsLabel, TERMS_OPTIONS } from "@/lib/invoicing";
import { longDay, money } from "@/lib/quotation";
import { salesBaseOf } from "@/lib/sales-base";
import { errorText } from "@/lib/user-error";

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
  return [pending, run, router] as const;
}

function TermsSelect({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  const options: number[] = TERMS_OPTIONS.includes(value as (typeof TERMS_OPTIONS)[number]) ? [...TERMS_OPTIONS] : [...TERMS_OPTIONS, value].sort((a, b) => a - b);
  return (
    <NativeSelect id={id} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((t) => (
        <NativeSelectOption key={t} value={String(t)}>
          {termsLabel(t)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Quote → sales order: asks for the customer's PO, the credit terms and where to deliver. */
export function ConvertToOrderDialog({ quoteId, quoteNumber, defaultTerms, accepted }: { quoteId: number; quoteNumber: string; defaultTerms: number; accepted: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, run, router] = useRun();
  const pathname = usePathname();
  const [f, setF] = useState({ customerRef: "", customerRefDate: "", termsDays: defaultTerms, deliveryAddress: "", notes: "" });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setF({ customerRef: "", customerRefDate: "", termsDays: defaultTerms, deliveryAddress: "", notes: "" });
        }
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button size="sm" title="The customer confirmed: make a sales order" />}>
        <ClipboardCheck /> Convert to sales order
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert {quoteNumber} to an order</DialogTitle>
          <DialogDescription>
            {accepted ? "" : "The quote will be marked Accepted and the deal Won. "}The lines and prices are copied from the quote. Upload the customer&apos;s PO on the order page.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => convertQuoteToOrder(quoteId, { ...f, customerRefDate: f.customerRefDate || null }),
              "Sales order created",
              (r) => {
                setOpen(false);
                router.push(`${salesBaseOf(pathname)}/orders/${(r as { id: number }).id}`);
              },
            );
          }}
        >
          <div className="grid grid-cols-[1fr_9.5rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="co-ref">Customer PO / LPO number</Label>
              <Input id="co-ref" value={f.customerRef} onChange={(e) => setF({ ...f, customerRef: e.target.value })} placeholder="optional" maxLength={80} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-refdate">PO date</Label>
              <Input id="co-refdate" type="date" value={f.customerRefDate} onChange={(e) => setF({ ...f, customerRefDate: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-terms">Credit terms</Label>
            <TermsSelect id="co-terms" value={f.termsDays} onChange={(termsDays) => setF({ ...f, termsDays })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-addr">Delivery address</Label>
            <Textarea id="co-addr" rows={2} value={f.deliveryAddress} onChange={(e) => setF({ ...f, deliveryAddress: e.target.value })} placeholder="optional" maxLength={500} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-notes">Notes</Label>
            <Input id="co-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="optional, printed on the proforma" maxLength={2000} />
          </div>
          <DialogFooter>
            <Button type="submit" pending={pending}>
              <ClipboardCheck /> Make the sales order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Change PO number, terms, address or notes while the order is not invoiced. */
export function EditOrderDialog({ order }: { order: { id: number; customerRef: string; customerRefDate: string | null; termsDays: number; deliveryAddress: string; notes: string } }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [f, setF] = useState({ ...order, customerRefDate: order.customerRefDate ?? "" });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setF({ ...order, customerRefDate: order.customerRefDate ?? "" });
        }
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="icon-sm" aria-label="Edit the sales order details" title="Edit PO, terms, address" />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sales order details</DialogTitle>
          <DialogDescription>The lines and prices come from the quote and do not change here.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_9.5rem] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="eo-ref">Customer PO / LPO number</Label>
            <Input id="eo-ref" value={f.customerRef} onChange={(e) => setF({ ...f, customerRef: e.target.value })} maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eo-refdate">PO date</Label>
            <Input id="eo-refdate" type="date" value={f.customerRefDate} onChange={(e) => setF({ ...f, customerRefDate: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="eo-terms">Credit terms</Label>
          <TermsSelect id="eo-terms" value={f.termsDays} onChange={(termsDays) => setF({ ...f, termsDays })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="eo-addr">Delivery address</Label>
          <Textarea id="eo-addr" rows={2} value={f.deliveryAddress} onChange={(e) => setF({ ...f, deliveryAddress: e.target.value })} maxLength={500} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="eo-notes">Notes</Label>
          <Input id="eo-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} />
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            onClick={() =>
              run(
                () =>
                  updateOrder(order.id, {
                    customerRef: f.customerRef,
                    customerRefDate: f.customerRefDate || null,
                    termsDays: f.termsDays,
                    deliveryAddress: f.deliveryAddress,
                    notes: f.notes,
                  }),
                "Sales order saved",
                () => setOpen(false),
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Goods handed over: gives the delivery note its number. */
export function MarkDeliveredDialog({ orderId, deliveryAddress }: { orderId: number; deliveryAddress: string }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [f, setF] = useState({ deliveredOn: dubaiToday(), receivedBy: "", deliveryAddress });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setF({ deliveredOn: dubaiToday(), receivedBy: "", deliveryAddress });
        }
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Truck /> Mark delivered
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delivered</DialogTitle>
          <DialogDescription>The whole sales order goes in one delivery. The delivery note gets its number now; print it for the customer to sign.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[9.5rem_1fr] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="md-date">Delivery date</Label>
            <Input id="md-date" type="date" max={dubaiToday()} value={f.deliveredOn} onChange={(e) => setF({ ...f, deliveredOn: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="md-by">Received by</Label>
            <Input id="md-by" value={f.receivedBy} onChange={(e) => setF({ ...f, receivedBy: e.target.value })} placeholder="name at the customer" maxLength={120} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="md-addr">Delivered to</Label>
          <Textarea id="md-addr" rows={2} value={f.deliveryAddress} onChange={(e) => setF({ ...f, deliveryAddress: e.target.value })} maxLength={500} />
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={!f.deliveredOn} onClick={() => run(() => markDelivered(orderId, f), "Marked delivered", () => setOpen(false))}>
            <Truck /> Save delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asks for a reason, then cancels (only before an invoice). */
export function CancelOrderButton({ orderId, number, bills = 0 }: { orderId: number; number: string; /** Supplier bills linked to the order (when the user may see them). */ bills?: number }) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Cancel sales order ${number}`}
      title="Cancel the sales order"
      pending={pending}
      onClick={() => {
        const kept = bills ? `\n\n${bills} supplier bill${bills === 1 ? " is" : "s are"} linked to it. They stay as stock: void them in Accounts if the goods go back to the supplier.` : "";
        const why = prompt(`Cancel ${number}?${kept}\n\nWhy is it cancelled?`);
        if (why) run(() => cancelOrder(orderId, why), "Sales order cancelled");
      }}
    >
      <Ban />
    </Button>
  );
}

/** Accounts: issue the tax invoice for a delivered order. */
export function IssueInvoiceDialog({
  orderId,
  orderNumber,
  termsDays,
  deliveredOn,
  address,
  total,
  customerTrn,
  nextNumber,
  ourTrn,
}: {
  orderId: number;
  orderNumber: string;
  termsDays: number;
  deliveredOn: string;
  address: string;
  total: number;
  customerTrn: string;
  nextNumber: string;
  /** Our TRN: without it the invoice cannot be issued. */
  ourTrn: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, run, router] = useRun();
  // From Accounts the new invoice opens; from a Sales order we stay on the order (the invoice shows on its Invoice tab)
  const inAccounts = usePathname().startsWith("/accounts");
  const [f, setF] = useState({ issueDate: dubaiToday(), termsDays, customerAddress: address });
  const due = dueDateFor(f.issueDate || dubaiToday(), f.termsDays);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setF({ issueDate: dubaiToday(), termsDays, customerAddress: address });
        }
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <FileCheck2 /> Make invoice
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tax invoice for {orderNumber}</DialogTitle>
          <DialogDescription>
            Will be {nextNumber}, {money(total)} with VAT. Once issued it cannot be edited; a mistake is fixed with a credit note.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ii-date">Invoice date</Label>
            <Input id="ii-date" type="date" min={deliveredOn} max={dubaiToday()} value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ii-terms">Credit terms</Label>
            <TermsSelect id="ii-terms" value={f.termsDays} onChange={(t) => setF({ ...f, termsDays: t })} />
          </div>
        </div>
        <p className="text-sm">
          Payment due: <strong>{longDay(due)}</strong>
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="ii-addr">Customer address on the invoice</Label>
          <Textarea id="ii-addr" rows={2} value={f.customerAddress} onChange={(e) => setF({ ...f, customerAddress: e.target.value })} maxLength={500} />
        </div>
        {!ourTrn && (
          <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-400">
            Our TRN is not set. An accountant adds it in Accounts › Settings › VAT registration; a tax invoice must show it.
          </p>
        )}
        {!customerTrn && <p className="text-xs text-amber-700 dark:text-amber-400">The customer has no TRN saved. Fine if they are not VAT registered; otherwise add it on the company first.</p>}
        <DialogFooter>
          <Button
            pending={pending} disabled={!f.issueDate || !ourTrn}
            onClick={() =>
              run(
                () => issueInvoice(orderId, f),
                inAccounts ? "Invoice issued" : "Invoice issued. It is on this sales order's Invoice tab.",
                (r) => {
                  setOpen(false);
                  if (inAccounts) router.push(`/accounts/invoices/${(r as { id: number }).id}`);
                },
              )
            }
          >
            <FileCheck2 /> Issue invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Accounts: money received, full or part, cash or bank transfer. */
export function RecordPaymentDialog({ invoiceId, invoiceNumber, balance, issueDate, trigger, accounts = [] }: { invoiceId: number; invoiceNumber: string; balance: number; issueDate: string; trigger?: React.ReactElement; accounts?: BankOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [f, setF] = useState({ paidOn: dubaiToday(), amount: String(balance), method: "bank" as "cash" | "bank", reference: "", notes: "" });
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const amount = Number(f.amount);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setF({ paidOn: dubaiToday(), amount: String(balance), method: "bank", reference: "", notes: "" });
          setBankAccountId(null);
        }
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Wallet /> Record payment
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment for {invoiceNumber}</DialogTitle>
          <DialogDescription>Still owed: {money(balance)}. A part payment leaves the rest open.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rp-amount">Amount (AED)</Label>
            <Input id="rp-amount" type="number" min={0.01} max={balance} step={0.01} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rp-date">Date received</Label>
            <Input id="rp-date" type="date" min={issueDate} max={dubaiToday()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="xs" onClick={() => setF({ ...f, amount: String(balance) })}>
            Full {money(balance)}
          </Button>
          <Button type="button" variant="outline" size="xs" onClick={() => setF({ ...f, amount: String(Math.round(balance * 50) / 100) })}>
            Half
          </Button>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Paid by</span>
          <div className="inline-flex w-fit rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="Paid by">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={f.method === m.key}
                onClick={() => setF({ ...f, method: m.key })}
                className={`h-7 rounded-md px-3 text-xs font-medium ${f.method === m.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <AccountPicker id="rp-acc" accounts={accounts} method={f.method} value={bankAccountId} onChange={setBankAccountId} />
        <div className="grid gap-1.5">
          <Label htmlFor="rp-ref">{f.method === "bank" ? "Bank reference (required)" : "Reference"}</Label>
          <Input id="rp-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder={f.method === "bank" ? "transfer / FT number" : "optional"} maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rp-notes">Note</Label>
          <Input id="rp-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="optional" maxLength={500} />
        </div>
        <DialogFooter>
          <Button
            pending={pending} disabled={!(amount > 0) || amount > balance + 0.001 || (f.method === "bank" && !f.reference.trim())}
            onClick={() => run(() => recordPayment(invoiceId, { ...f, amount, bankAccountId: pickedAccount(accounts, f.method, bankAccountId) }), "Payment recorded", () => setOpen(false))}
          >
            <Receipt /> Save payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VoidPaymentButton({ paymentId, number }: { paymentId: number; number: string }) {
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
        if (why) run(() => voidPayment(paymentId, why), "Payment voided");
      }}
    >
      <Undo2 />
    </Button>
  );
}

export function CancelInvoiceButton({ invoiceId, number, opening = false }: { invoiceId: number; number: string; opening?: boolean }) {
  const [pending, run] = useRun();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [goodsBack, setGoodsBack] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setWhy("");
          setGoodsBack(true);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" pending={pending} title={opening ? "Remove this opening balance (entered by mistake)" : "Cancel with a credit note"}>
            <Ban /> {opening ? "Remove" : "Cancel invoice"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{opening ? `Remove opening invoice ${number}` : `Cancel ${number}`}</DialogTitle>
          <DialogDescription>
            {opening ? "It stays on record, crossed out." : "Makes a credit note for the full amount. The order goes back to Delivered so a corrected invoice can be issued."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="ci-why">Why</Label>
          <Input id="ci-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} />
        </div>
        {!opening && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={goodsBack} onCheckedChange={(v) => setGoodsBack(!!v)} />
            <span className="grid leading-tight">
              The goods are coming back
              <span className="text-xs text-muted-foreground">Their cost returns to stock. Untick when the customer keeps them, or for services: the cost then stays a cost.</span>
            </span>
          </label>
        )}
        <DialogFooter>
          <Button
            pending={pending}
            disabled={why.trim().length < 3}
            onClick={() => {
              run(() => cancelInvoice(invoiceId, why, { goodsBack }), opening ? "Opening invoice removed" : "Invoice cancelled, credit note made");
              setOpen(false);
            }}
          >
            <Ban /> {opening ? "Remove" : "Cancel invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
