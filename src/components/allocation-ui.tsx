"use client";

import { Ban, Banknote, Coins, Printer, Unlink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyAdvance, removeAllocation } from "@/app/(app)/accounts/actions";
import { applySupplierAdvance, removeSupplierAllocation } from "@/app/(app)/accounts/purchase-actions";
import { refundAdvance, voidAdvanceRefund } from "@/app/(app)/accounts/note-actions";
import { AccountPicker, pickedAccount, type BankOption } from "@/components/account-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dubaiToday } from "@/lib/dates";
import { longDay, money, round2 } from "@/lib/quotation";
import { errorText } from "@/lib/user-error";

export interface AdvanceOption {
  id: number;
  number: string;
  paidOn: string;
  left: number;
}
export interface OpenDocument {
  id: number;
  number: string;
  issueDate: string;
  balance: number;
}

/** Sets money already received or paid (an advance) against an invoice or bill of the same customer or supplier. */
export function ApplyAdvanceDialog({ party, advances, documents, label = "Apply advance" }: { party: "customer" | "supplier"; advances: AdvanceOption[]; documents: OpenDocument[]; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [advanceId, setAdvanceId] = useState(advances[0]?.id ?? 0);
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? 0);
  const fullOf = (aId: number, dId: number) => round2(Math.min(advances.find((a) => a.id === aId)?.left ?? 0, documents.find((d) => d.id === dId)?.balance ?? 0));
  const [amount, setAmount] = useState(String(fullOf(advances[0]?.id ?? 0, documents[0]?.id ?? 0)));
  const [appliedOn, setAppliedOn] = useState(dubaiToday());
  const advance = advances.find((a) => a.id === advanceId);
  const doc = documents.find((d) => d.id === documentId);
  const n = Number(amount);
  const earliest = [advance?.paidOn ?? "", doc?.issueDate ?? ""].sort().at(-1) ?? "";
  const docName = party === "customer" ? "invoice" : "bill";
  const save = () =>
    start(async () => {
      try {
        if (party === "customer") await applyAdvance({ paymentId: advanceId, invoiceId: documentId, amount: n, appliedOn });
        else await applySupplierAdvance({ paymentId: advanceId, billId: documentId, amount: n, appliedOn });
        toast.success("Advance applied");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setAdvanceId(advances[0]?.id ?? 0);
          setDocumentId(documents[0]?.id ?? 0);
          setAmount(String(fullOf(advances[0]?.id ?? 0, documents[0]?.id ?? 0)));
          setAppliedOn(dubaiToday());
        }
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title={`Use money already ${party === "customer" ? "received" : "paid"} for this ${docName}`}>
            <Coins /> {label}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply an advance</DialogTitle>
          <DialogDescription>No new money moves: part of an earlier {party === "customer" ? "receipt" : "voucher"} is set against the {docName}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-adv">Advance</Label>
          <NativeSelect
            id="aa-adv"
            value={String(advanceId)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setAdvanceId(v);
              setAmount(String(fullOf(v, documentId)));
            }}
          >
            {advances.map((a) => (
              <NativeSelectOption key={a.id} value={String(a.id)}>
                {a.number} · {longDay(a.paidOn)} · {money(a.left)} left
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="aa-doc">{party === "customer" ? "Invoice" : "Bill"}</Label>
          <NativeSelect
            id="aa-doc"
            value={String(documentId)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDocumentId(v);
              setAmount(String(fullOf(advanceId, v)));
            }}
          >
            {documents.map((d) => (
              <NativeSelectOption key={d.id} value={String(d.id)}>
                {d.number} · {money(d.balance)} open
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="aa-amt">Amount (AED)</Label>
            <Input id="aa-amt" type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aa-date">Date</Label>
            <Input id="aa-date" type="date" min={earliest} max={dubaiToday()} value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={!(n > 0) || n > fullOf(advanceId, documentId) + 0.001 || !appliedOn} onClick={save}>
            <Coins /> Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Takes a payment off one invoice or bill. The document is open again; the money stays as an advance. */
export function RemoveAllocationButton({ party, allocationId, number, documentNumber }: { party: "customer" | "supplier"; allocationId: number; number: string; documentNumber: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Take ${number} off ${documentNumber}`}
      title="Take this payment off, and keep the money as an advance"
      pending={pending}
      onClick={() => {
        const why = prompt(`Take ${number} off ${documentNumber}? ${documentNumber} will be open again and the money stays as an advance. Why?`);
        if (!why) return;
        start(async () => {
          try {
            if (party === "customer") await removeAllocation(allocationId, why);
            else await removeSupplierAllocation(allocationId, why);
            toast.success("Taken off, kept as an advance");
            router.refresh();
          } catch (e) {
            toast.error(errorText(e));
          }
        });
      }}
    >
      <Unlink />
    </Button>
  );
}

/** Hands an advance back: paid to a customer, or received back from a supplier. */
export function RefundAdvanceDialog({ party, advances, accounts }: { party: "customer" | "supplier"; advances: AdvanceOption[]; accounts: BankOption[] }) {
  const customer = party === "customer";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState(advances[0]?.id ?? 0);
  const [amount, setAmount] = useState(String(advances[0]?.left ?? ""));
  const [refundedOn, setRefundedOn] = useState(dubaiToday());
  const [method, setMethod] = useState<"cash" | "bank">("bank");
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const advance = advances.find((a) => a.id === paymentId);
  const n = Number(amount);
  const can = n > 0 && !!advance && n <= advance.left && reason.trim().length >= 3 && (method === "cash" || !!reference.trim());
  const save = () =>
    start(async () => {
      try {
        const r = await refundAdvance({ party, paymentId, amount: n, refundedOn, method, bankAccountId: pickedAccount(accounts, method, bankAccountId), reference, reason });
        toast.success(`Refund ${r.number} saved`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setPaymentId(advances[0]?.id ?? 0);
          setAmount(String(advances[0]?.left ?? ""));
          setRefundedOn(dubaiToday());
          setReference("");
          setReason("");
          setBankAccountId(null);
        }
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title={customer ? "Pay an advance back to the customer" : "Record money the supplier paid back"}>
            <Banknote /> {customer ? "Refund advance" : "Refund received"}
          </Button>
        }
      />
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? "Refund an advance to the customer" : "Refund received from the supplier"}</DialogTitle>
          <DialogDescription>{customer ? "The money leaves the bank or cash and the advance goes down." : "The money comes into the bank or cash and the advance goes down."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rf-adv">Advance</Label>
          <NativeSelect
            id="rf-adv"
            value={String(paymentId)}
            onChange={(e) => {
              const id = Number(e.target.value);
              setPaymentId(id);
              setAmount(String(advances.find((a) => a.id === id)?.left ?? ""));
            }}
          >
            {advances.map((a) => (
              <NativeSelectOption key={a.id} value={String(a.id)}>
                {a.number} · {money(a.left)} left
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rf-amt">Amount</Label>
            <Input id="rf-amt" inputMode="decimal" className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rf-date">Date</Label>
            <Input id="rf-date" type="date" min={advance?.paidOn} max={dubaiToday()} value={refundedOn} onChange={(e) => setRefundedOn(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rf-method">Paid by</Label>
          <NativeSelect id="rf-method" value={method} onChange={(e) => setMethod(e.target.value as "cash" | "bank")}>
            <NativeSelectOption value="bank">Bank transfer</NativeSelectOption>
            <NativeSelectOption value="cash">Cash</NativeSelectOption>
          </NativeSelect>
        </div>
        <AccountPicker id="rf-acc" accounts={accounts} method={method} value={bankAccountId} onChange={setBankAccountId} />
        {method === "bank" && (
          <div className="grid gap-1.5">
            <Label htmlFor="rf-ref">Bank reference (required)</Label>
            <Input id="rf-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="transfer / FT number" />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="rf-why">Reason</Label>
          <Input id="rf-why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Refund for returned goods, credit note ZCN-2026-0001" />
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={!can} onClick={save}>
            <Banknote /> Save refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidRefundButton({ id, number }: { id: number; number: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Void ${number}`} title="Void this refund">
            <Ban />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void {number}</DialogTitle>
          <DialogDescription>The money counts as an advance again. The refund stays on record, crossed out.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rf-void">Why</Label>
          <Input id="rf-void" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} />
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={why.trim().length < 3}
            onClick={() =>
              start(async () => {
                try {
                  await voidAdvanceRefund(id, why);
                  toast.success("Refund voided");
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  toast.error(errorText(e));
                }
              })
            }
          >
            <Ban /> Void refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The refunds of one customer's or supplier's advances. */
export function RefundList({ rows, party }: { rows: { id: number; number: string; refundedOn: string; amount: number; method: string; reference: string; reason: string; voidedAt: string | null; voidReason: string; paymentNumber: string }[]; party: "customer" | "supplier" }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((r) => (
        <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm ${r.voidedAt ? "opacity-60" : ""}`}>
          <span className={`font-mono font-medium ${r.voidedAt ? "line-through" : ""}`}>{r.number}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={r.reason}>
            {longDay(r.refundedOn)} · {party === "customer" ? "paid to customer" : "received from supplier"} · advance {r.paymentNumber} · {r.voidedAt ? `void: ${r.voidReason}` : r.reason}
          </span>
          <span className="tabular-nums">{money(r.amount)}</span>
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/refund/${r.id}`} target="_blank" />} aria-label={`Print ${r.number}`} title="Refund voucher">
            <Printer />
          </Button>
          {!r.voidedAt && <VoidRefundButton id={r.id} number={r.number} />}
        </li>
      ))}
    </ul>
  );
}
