"use client";

import { Ban, Check, Plus, RefreshCw, Save, Trash2, Wallet, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AccountPicker, pickedAccount, type BankOption } from "@/components/account-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addPayItem, deleteDraftPayslip, generatePayslips, markPayslipPaid, recordAdvance, refreshPayslipAttendance, saveSalary, savePayslip, setPayItemActive, voidAdvance, voidPayslip } from "@/app/(app)/accounts/payroll-actions";
import { type PayKind, payslipTotals } from "@/lib/payroll";
import { money } from "@/lib/quotation";
import { errorText } from "@/lib/user-error";

/** Buttons and forms for Accounts › Payroll. Each one calls a server action and shows its message in a toast. */

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, ok: string, then?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
        then?.();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

export function GenerateButton({ month, missing }: { month: string; missing: number }) {
  const [pending, run] = useAction();
  return (
    <Button size="sm" variant={missing ? "default" : "outline"} pending={pending} disabled={!missing} onClick={() => run(async () => { const r = await generatePayslips(month); toast.message(r.made ? `${r.made} draft payslip${r.made === 1 ? "" : "s"} made` : "Nothing to make"); }, "Done")}>
      <WandSparkles /> Make payslips{missing ? ` (${missing})` : ""}
    </Button>
  );
}

/** The monthly salary of one person, saved when the field is left. */
export function SalaryInput({ userId, salary }: { userId: number; salary: number }) {
  const [value, setValue] = useState(salary ? String(salary) : "");
  const [pending, run] = useAction();
  const save = () => {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n === salary) return;
    run(() => saveSalary(userId, n), "Salary saved");
  };
  return (
    <Input
      aria-label="Monthly salary"
      inputMode="decimal"
      className="h-7 w-28 text-right tabular-nums"
      placeholder="Not set"
      value={value}
      disabled={pending}
      onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

export function AdvanceDialog({ people, accounts, defaultUserId }: { people: { id: number; name: string }[]; accounts: BankOption[]; defaultUserId?: number }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useAction();
  const blank = () => ({ userId: String(defaultUserId ?? people[0]?.id ?? ""), amount: "", paidOn: today(), method: "bank" as "cash" | "bank", bankAccountId: null as number | null, reference: "", notes: "" });
  const [f, setF] = useState(blank);
  const valid = !!f.userId && Number(f.amount) > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setF(blank()); // a fresh form every time it opens
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Wallet /> Pay advance
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay an advance</DialogTitle>
          <DialogDescription>Money paid to an employee before payday. It is owed back until a payslip takes it off.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            run(() => recordAdvance({ userId: Number(f.userId), amount: Number(f.amount), paidOn: f.paidOn, method: f.method, bankAccountId: pickedAccount(accounts, f.method, f.bankAccountId), reference: f.reference, notes: f.notes }), "Advance recorded", () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="adv-who">Employee</Label>
            <NativeSelect id="adv-who" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
              {people.map((p) => (
                <NativeSelectOption key={p.id} value={String(p.id)}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="adv-amt">Amount (AED)</Label>
              <Input id="adv-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adv-date">Date</Label>
              <Input id="adv-date" type="date" max={today()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="adv-method">Paid by</Label>
              <NativeSelect id="adv-method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as "cash" | "bank", bankAccountId: null })}>
                <NativeSelectOption value="bank">Bank</NativeSelectOption>
                <NativeSelectOption value="cash">Cash</NativeSelectOption>
              </NativeSelect>
            </div>
            <AccountPicker id="adv-acc" accounts={accounts} method={f.method} value={f.bankAccountId} onChange={(id) => setF({ ...f, bankAccountId: id })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adv-note">Note</Label>
            <Input id="adv-note" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="submit" pending={pending} disabled={!valid}>
              Record advance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Void with a reason: for a paid payslip or an advance. */
export function VoidButton({ kind, id, label }: { kind: "payslip" | "advance"; id: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, run] = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setReason("");
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Ban /> Void
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void {label}?</DialogTitle>
          <DialogDescription>It stays on record, crossed out, and what it posted to the books is reversed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="void-why">Reason</Label>
          <Input id="void-why" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="destructive" pending={pending} disabled={reason.trim().length < 3} onClick={() => run(() => (kind === "payslip" ? voidPayslip(id, reason) : voidAdvance(id, reason)), "Voided", () => setOpen(false))}>
            Void
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PayItemsPanel({ items }: { items: { id: number; name: string; kind: PayKind; systemKey: string | null; isActive: boolean }[] }) {
  const [pending, run] = useAction();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PayKind>("earning");
  return (
    <div className="grid max-w-xl gap-3">
      <p className="text-xs text-muted-foreground">These are the lines you can add to a payslip. Add your own (Travel allowance, Loan, Visa fee...). Switching one off hides it from the list but keeps it on old payslips.</p>
      <ul className="divide-y rounded-xl border bg-card text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-3 py-2">
            <span className={i.isActive ? "" : "text-muted-foreground line-through"}>{i.name}</span>
            <span className="text-xs text-muted-foreground">{i.kind === "earning" ? "Earning" : "Deduction"}</span>
            {i.systemKey && <span className="text-xs text-muted-foreground">· used by Payroll</span>}
            {!i.systemKey && (
              <Button size="xs" variant="ghost" className="ml-auto" disabled={pending} onClick={() => run(() => setPayItemActive(i.id, !i.isActive), i.isActive ? "Switched off" : "Switched on")}>
                {i.isActive ? "Switch off" : "Switch on"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 2) return;
          run(() => addPayItem({ name, kind }), "Pay item added", () => setName(""));
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pi-name">New pay item</Label>
          <Input id="pi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Travel allowance" className="w-56" />
        </div>
        <NativeSelect aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as PayKind)}>
          <NativeSelectOption value="earning">Earning (adds to pay)</NativeSelectOption>
          <NativeSelectOption value="deduction">Deduction (takes off)</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" size="sm" pending={pending} disabled={name.trim().length < 2}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  );
}

// ---------- the payslip ----------

interface Item {
  id: number;
  name: string;
  kind: PayKind;
  systemKey: string | null;
  isActive: boolean;
}
interface Slip {
  id: number;
  number: string;
  baseSalary: number;
  notes: string;
  lines: { typeId: number | null; label: string; kind: PayKind; systemKey: string | null; amount: number; note: string }[];
}
type EditLine = { key: number; typeId: number; amount: string; note: string };

/** A draft payslip: the salary for the month and any number of lines of any pay item. Totals update as you type. */
export function PayslipEditor({ slip, items: initialItems, accounts, advanceOwed }: { slip: Slip; items: Item[]; accounts: BankOption[]; advanceOwed: number }) {
  const router = useRouter();
  const [pending, run] = useAction();
  const [items, setItems] = useState(initialItems);
  const [base, setBase] = useState(String(slip.baseSalary));
  const [notes, setNotes] = useState(slip.notes);
  const [lines, setLines] = useState<EditLine[]>(() => slip.lines.filter((l) => l.typeId).map((l, i) => ({ key: i, typeId: l.typeId as number, amount: String(l.amount), note: l.note })));
  const [next, setNext] = useState(1000);
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<PayKind>("earning");
  const [paying, setPaying] = useState(false);

  const byId = new Map(items.map((i) => [i.id, i]));
  const asLines = lines.map((l) => ({ label: byId.get(l.typeId)?.name ?? "", kind: byId.get(l.typeId)?.kind ?? "earning", systemKey: byId.get(l.typeId)?.systemKey ?? null, amount: Number(l.amount) || 0 }));
  const t = payslipTotals(Number(base) || 0, asLines);
  const body = () => ({ baseSalary: Number(base) || 0, notes, lines: lines.filter((l) => Number(l.amount) > 0).map((l) => ({ typeId: l.typeId, amount: Number(l.amount), note: l.note })) });

  const addLine = (typeId: number) => {
    setLines((ls) => [...ls, { key: next, typeId, amount: "", note: "" }]);
    setNext((n) => n + 1);
    setPick("");
  };
  const patch = (key: number, p: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="grid items-end gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="ps-base">Salary for the month (AED)</Label>
            <Input id="ps-base" inputMode="decimal" className="text-right tabular-nums" value={base} onChange={(e) => setBase(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <p className="text-xs text-muted-foreground">Change it for this month only. The standing salary is set in the Payroll table.</p>
        </div>

        <div className="grid gap-2">
          {lines.length === 0 && <p className="text-sm text-muted-foreground">No extra lines. Add a bonus, overtime, a deduction or an advance recovery below.</p>}
          {lines.map((l) => {
            const it = byId.get(l.typeId);
            return (
              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 sm:grid-cols-[10rem_8rem_minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it?.name ?? "?"}</div>
                  <div className="text-xs text-muted-foreground">{it?.kind === "deduction" ? "Takes off" : "Adds"}</div>
                </div>
                <Input aria-label={`${it?.name} amount`} inputMode="decimal" className="text-right tabular-nums" placeholder="0.00" value={l.amount} onChange={(e) => patch(l.key, { amount: e.target.value.replace(/[^\d.]/g, "") })} />
                <Input aria-label="Note" className="col-span-2 sm:col-span-1" placeholder="Note (optional)" value={l.note} onChange={(e) => patch(l.key, { note: e.target.value })} />
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${it?.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Add a line" value={pick} onChange={(e) => e.target.value && addLine(Number(e.target.value))} className="w-56">
            <NativeSelectOption value="">+ Add a line…</NativeSelectOption>
            <optgroup label="Earnings">
              {items.filter((i) => i.isActive && i.kind === "earning").map((i) => (
                <NativeSelectOption key={i.id} value={i.id}>
                  {i.name}
                </NativeSelectOption>
              ))}
            </optgroup>
            <optgroup label="Deductions">
              {items.filter((i) => i.isActive && i.kind === "deduction").map((i) => (
                <NativeSelectOption key={i.id} value={i.id}>
                  {i.name}
                </NativeSelectOption>
              ))}
            </optgroup>
          </NativeSelect>
          <span className="text-xs text-muted-foreground">or a new item:</span>
          <Input aria-label="New pay item name" className="h-8 w-40" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <NativeSelect aria-label="New item kind" value={newKind} onChange={(e) => setNewKind(e.target.value as PayKind)}>
            <NativeSelectOption value="earning">Earning</NativeSelectOption>
            <NativeSelectOption value="deduction">Deduction</NativeSelectOption>
          </NativeSelect>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || newName.trim().length < 2}
            onClick={() =>
              run(async () => {
                const row = await addPayItem({ name: newName, kind: newKind });
                setItems((x) => [...x, { id: row.id, name: row.name, kind: row.kind, systemKey: row.systemKey, isActive: true }]);
                addLine(row.id);
                setNewName("");
              }, "Pay item added")
            }
          >
            <Plus /> Add
          </Button>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ps-notes">Note on the payslip</Label>
          <Textarea id="ps-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
        <span>
          Total pay <strong className="tabular-nums">{money(t.gross)}</strong>
        </span>
        <span>
          Deductions <strong className="tabular-nums">{money(t.deductions)}</strong>
        </span>
        <span>
          Net <strong className="text-base tabular-nums">{money(t.net)}</strong>
        </span>
        {advanceOwed > 0 && <span className="text-xs text-muted-foreground">Advance still owed: {money(advanceOwed)}</span>}
        {t.net < 0 && <span className="text-xs font-medium text-destructive">Deductions are more than the pay.</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => refreshPayslipAttendance(slip.id), "Attendance refreshed")} title="Read attendance again">
            <RefreshCw /> Attendance
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete draft ${slip.number}?`)) run(async () => { await deleteDraftPayslip(slip.id); router.replace("/accounts/payroll"); }, "Draft deleted");
            }}
          >
            <Trash2 /> Delete
          </Button>
          <Button size="sm" variant="outline" pending={pending} onClick={() => run(() => savePayslip(slip.id, body()), "Saved")}>
            <Save /> Save
          </Button>
          <PayDialog open={paying} setOpen={setPaying} net={t.net} accounts={accounts} saveFirst={() => savePayslip(slip.id, body())} slipId={slip.id} disabled={t.net < 0 || t.gross <= 0} />
        </div>
      </div>
    </div>
  );
}

function PayDialog({ open, setOpen, net, accounts, saveFirst, slipId, disabled }: { open: boolean; setOpen: (o: boolean) => void; net: number; accounts: BankOption[]; saveFirst: () => Promise<unknown>; slipId: number; disabled: boolean }) {
  const [pending, run] = useAction();
  const blank = () => ({ paidOn: today(), method: "bank" as "cash" | "bank", bankAccountId: null as number | null, reference: "" });
  const [f, setF] = useState(blank);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setF(blank());
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button size="sm" disabled={disabled} />}>
        <Check /> Mark paid
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {money(net)}</DialogTitle>
          <DialogDescription>This saves the payslip as it is, locks it and posts the salary to the books.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pay-date">Paid on</Label>
              <Input id="pay-date" type="date" max={today()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-method">Paid by</Label>
              <NativeSelect id="pay-method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as "cash" | "bank", bankAccountId: null })}>
                <NativeSelectOption value="bank">Bank transfer</NativeSelectOption>
                <NativeSelectOption value="cash">Cash</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          <AccountPicker id="pay-acc" accounts={accounts} method={f.method} value={f.bankAccountId} onChange={(id) => setF({ ...f, bankAccountId: id })} />
          <div className="grid gap-1.5">
            <Label htmlFor="pay-ref">Reference</Label>
            <Input id="pay-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Transfer or WPS reference (optional)" />
          </div>
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            onClick={() =>
              run(async () => {
                await saveFirst();
                await markPayslipPaid(slipId, { paidOn: f.paidOn, method: f.method, bankAccountId: pickedAccount(accounts, f.method, f.bankAccountId), reference: f.reference });
              }, "Payslip paid", () => setOpen(false))
            }
          >
            Pay {money(net)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
