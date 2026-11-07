"use client";

import { Landmark, Lock, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fileVatReturn, payVatReturn, undoVatFiling } from "@/app/(app)/accounts/vat-actions";
import { AccountPicker, pickedAccount, type BankOption } from "@/components/account-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dubaiToday } from "@/lib/dates";
import { addDays, longDay, money } from "@/lib/quotation";
import { errorText } from "@/lib/user-error";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string, done?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        done?.();
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

export function VatPeriodPicker({ value, periods }: { value: string; periods: { from: string; label: string }[] }) {
  const router = useRouter();
  return (
    <NativeSelect size="sm" aria-label="VAT period" value={value} onChange={(e) => router.push(`/accounts/vat?from=${e.target.value}`)}>
      {periods.map((p) => (
        <NativeSelectOption key={p.from} value={p.from}>
          {p.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Filing locks the period: the dialog says so plainly before it happens. */
export function FileVatDialog({ from, to, label, payable, blocked }: { from: string; to: string; label: string; payable: number; blocked: string | null }) {
  const router = useRouter();
  const [pending, run] = useRun();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setReference("");
        }
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" disabled={!!blocked} title={blocked ?? "Keep this return and lock the period"}>
            <Lock /> File return
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>File {label}</DialogTitle>
          <DialogDescription>
            {payable >= 0 ? `${money(payable)} becomes payable to the FTA` : `${money(-payable)} becomes refundable from the FTA`}. The return is kept as it stands and the books lock up to {longDay(to)}. Only do this once you have submitted it in the FTA portal.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="vat-ref">FTA reference (optional)</Label>
          <Input id="vat-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            onClick={() =>
              run(
                () => fileVatReturn({ from, to, reference }),
                "VAT return filed, period locked",
                () => {
                  setOpen(false);
                  // stay on the return just filed: to pay it, or to read it
                  router.replace(`/accounts/vat?from=${from}`);
                },
              )
            }
          >
            <Lock /> File and lock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PayVatDialog({ id, payable, periodEnd, accounts }: { id: number; payable: number; periodEnd: string; accounts: BankOption[] }) {
  const [pending, run] = useRun();
  const [open, setOpen] = useState(false);
  const today = dubaiToday();
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const refund = payable < 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setPaidOn(dubaiToday());
          setReference("");
          setBankAccountId(null);
        }
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Landmark /> {refund ? "Refund received" : "Pay VAT"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{refund ? "Refund from the FTA" : "VAT paid to the FTA"}</DialogTitle>
          <DialogDescription>{money(Math.abs(payable))}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="vat-paid">Date</Label>
          <Input id="vat-paid" type="date" min={addDays(periodEnd, 1)} max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
        <AccountPicker id="vat-acc" accounts={accounts} method="bank" value={bankAccountId} onChange={setBankAccountId} />
        <div className="grid gap-1.5">
          <Label htmlFor="vat-pay-ref">Bank reference</Label>
          <Input id="vat-pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="Optional" />
        </div>
        <DialogFooter>
          <Button pending={pending} onClick={() => run(() => payVatReturn(id, { paidOn, method: "bank", bankAccountId: pickedAccount(accounts, "bank", bankAccountId), reference }), refund ? "Refund recorded" : "VAT payment recorded", () => setOpen(false))}>
            <Landmark /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UndoVatButton({ id, label }: { id: number; label: string }) {
  const [pending, run] = useRun();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // what was owed or left may have changed since the page loaded (a debit note, a payment): start from today's figures
        if (o) {
          setWhy("");
        }
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost">
            <Undo2 /> Undo filing
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Undo the filing of {label}</DialogTitle>
          <DialogDescription>Reverses its entries and puts the lock date back. Only for a filing made here by mistake: once the FTA has a return, correct it there with a voluntary disclosure or in the next return.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="vat-why">Why</Label>
          <Input id="vat-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} />
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={why.trim().length < 3} onClick={() => run(() => undoVatFiling(id, why), "Filing undone", () => setOpen(false))}>
            <Undo2 /> Undo filing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
