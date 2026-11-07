"use client";

import { Pencil, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { postClosingStock, postJournal, reverseJournal, saveAccount } from "@/app/(app)/accounts/ledger-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/ledger/coa-templates";
import { amount, journalProblem, journalTotals, partyNeededFor } from "@/lib/ledger/journal";
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

const num = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export interface GroupOption {
  id: number;
  code: string;
  name: string;
  type: AccountType;
}

export interface EditableAccount {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  parentId: number | null;
  isGroup: boolean;
  isActive: boolean;
  description: string;
  systemKey: string | null;
  lines: number;
}

/** Adds an account, or edits one (the pencil on a row). Accounts are switched off, never deleted. */
export function AccountDialog({ account, groups, defaultParent }: { account?: EditableAccount; groups: GroupOption[]; defaultParent?: GroupOption }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const blank = {
    code: account?.code ?? "",
    name: account?.name ?? "",
    type: (account?.type ?? defaultParent?.type ?? "expense") as AccountType,
    parentId: account ? (account.parentId ? String(account.parentId) : "") : defaultParent ? String(defaultParent.id) : "",
    isGroup: account?.isGroup ?? false,
    isActive: account?.isActive ?? true,
    description: account?.description ?? "",
  };
  const [f, setF] = useState(blank);
  const locked = !!account && (!!account.systemKey || account.lines > 0);
  const parents = groups.filter((g) => g.type === f.type && g.id !== account?.id);
  const can = f.code.trim() && f.name.trim().length >= 2;
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
          account ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${account.code} ${account.name}`} title="Edit account" />
          ) : (
            <Button size="sm" variant="outline" aria-label="New account" title="New account" />
          )
        }
      >
        {account ? <Pencil /> : <Plus />}
        {!account && "Account"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? `${account.code} ${account.name}` : "New account"}</DialogTitle>
          <DialogDescription>
            {account?.systemKey
              ? "The portal posts to this account by itself: you can rename and renumber it, but its type stays."
              : "Accounts are never deleted. Switch one off when it is no longer used."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="acc-code">Code</Label>
            <Input id="acc-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="6150" maxLength={12} className="font-mono" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-name">Name</Label>
            <Input id="acc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Staff training" maxLength={120} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="acc-type">Type</Label>
            <NativeSelect id="acc-type" value={f.type} disabled={locked} onChange={(e) => setF({ ...f, type: e.target.value as AccountType, parentId: "" })}>
              {ACCOUNT_TYPES.map((t) => (
                <NativeSelectOption key={t.key} value={t.key}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-parent">Under</Label>
            <NativeSelect id="acc-parent" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
              <NativeSelectOption value="">Top level</NativeSelectOption>
              {parents.map((g) => (
                <NativeSelectOption key={g.id} value={String(g.id)}>
                  {g.code} · {g.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acc-desc">What goes here (optional)</Label>
          <Textarea id="acc-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2" title="A group only adds up the accounts under it; nothing is posted to it.">
            <Checkbox checked={f.isGroup} disabled={!!account && (account.lines > 0 || !!account.systemKey)} onCheckedChange={(v) => setF({ ...f, isGroup: !!v })} /> Group (holds other accounts)
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={f.isActive} disabled={!!account?.systemKey} onCheckedChange={(v) => setF({ ...f, isActive: !!v })} /> In use
          </label>
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!can}
            onClick={() =>
              run(
                () =>
                  saveAccount(account?.id ?? null, {
                    code: f.code,
                    name: f.name,
                    type: f.type,
                    parentId: f.parentId ? Number(f.parentId) : null,
                    isGroup: f.isGroup,
                    isActive: f.isActive,
                    description: f.description,
                  }),
                account ? "Account saved" : "Account added",
                () => setOpen(false),
              )
            }
          >
            <Save /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface PostableAccount {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  systemKey: string | null;
}

export interface JournalParties {
  customers: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
}

interface Row {
  key: number;
  accountId: string;
  /** Customer or supplier, on the accounts that add up what each one owes. */
  partyId: string;
  description: string;
  debit: string;
  credit: string;
}

/** Account picker grouped by type, "1110 · Cash in hand"; typing the code jumps to it. */
function AccountPicker({ id, value, accounts, onChange }: { id: string; value: string; accounts: PostableAccount[]; onChange: (v: string) => void }) {
  return (
    <NativeSelect id={id} size="sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Account" className="w-full min-w-0">
      <NativeSelectOption value="">Pick an account…</NativeSelectOption>
      {ACCOUNT_TYPES.map((t) => {
        const of = accounts.filter((a) => a.type === t.key);
        return of.length ? (
          <NativeSelectOptGroup key={t.key} label={t.plural}>
            {of.map((a) => (
              <NativeSelectOption key={a.id} value={String(a.id)}>
                {a.code} · {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ) : null;
      })}
    </NativeSelect>
  );
}

let rowKey = 0;
const emptyRow = (debit = "", credit = ""): Row => ({ key: ++rowKey, accountId: "", partyId: "", description: "", debit, credit });

/**
 * A journal typed like a small spreadsheet. A new line comes pre-filled with what still balances the entry; Save is
 * only possible once debits equal credits. Ctrl+S saves.
 */
export function JournalForm({ accounts, parties, today }: { accounts: PostableAccount[]; parties: JournalParties; today: string }) {
  const [pending, run, router] = useRun();
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(), emptyRow()]);
  const formRef = useRef<HTMLDivElement>(null);

  const lines = rows.map((r) => ({ debit: num(r.debit), credit: num(r.credit) }));
  const used = rows.filter((r) => r.accountId || num(r.debit) || num(r.credit));
  const t = journalTotals(lines);
  const needs = (r: Row) => partyNeededFor(accounts.find((a) => String(a.id) === r.accountId)?.systemKey);
  const problem = used.some((r) => !r.accountId)
    ? "Pick an account on every line."
    : used.some((r) => needs(r) && !r.partyId)
      ? "Say which customer or supplier each receivable or payable line is for."
      : journalProblem(used.map((r) => ({ debit: num(r.debit), credit: num(r.credit) })));
  const can = !problem && memo.trim().length >= 3 && !!date;

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addLine = () => {
    const d = t.difference;
    setRows((rs) => [...rs, d > 0 ? emptyRow("", amount(d).replace(/,/g, "")) : d < 0 ? emptyRow(amount(-d).replace(/,/g, ""), "") : emptyRow()]);
  };

  const save = () => {
    if (!can || pending) return;
    run(
      () =>
        postJournal({
          date,
          memo,
          lines: used.map((r) => ({ accountId: Number(r.accountId), partyId: needs(r) && r.partyId ? Number(r.partyId) : null, description: r.description, debit: num(r.debit), credit: num(r.credit) })),
        }),
      "Journal posted",
      (r) => router.replace(`/accounts/journals/${(r as { id: number }).id}`),
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && formRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={formRef} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="jv-date">Date</Label>
          <Input id="jv-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="jv-memo">What is it for</Label>
          <Input id="jv-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. October rent accrual, owner capital injection" maxLength={300} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="w-8 px-2 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">Account</th>
              <th className="px-2 py-2 text-left font-medium">Line note</th>
              <th className="w-32 px-2 py-2 text-right font-medium">Debit</th>
              <th className="w-32 px-2 py-2 text-right font-medium">Credit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="px-2 py-1.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <AccountPicker id={`jv-acc-${r.key}`} value={r.accountId} accounts={accounts} onChange={(v) => set(r.key, { accountId: v, partyId: "" })} />
                  {needs(r) && (
                    <NativeSelect size="sm" value={r.partyId} onChange={(e) => set(r.key, { partyId: e.target.value })} aria-label={`Line ${i + 1} ${needs(r)}`} className="mt-1 w-full min-w-0">
                      <NativeSelectOption value="">{needs(r) === "customer" ? "Which customer?" : "Which supplier?"}</NativeSelectOption>
                      {(needs(r) === "customer" ? parties.customers : parties.suppliers).map((p) => (
                        <NativeSelectOption key={p.id} value={String(p.id)}>
                          {p.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8" value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} maxLength={300} aria-label={`Line ${i + 1} note`} />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-right tabular-nums"
                    inputMode="decimal"
                    value={r.debit}
                    aria-label={`Line ${i + 1} debit`}
                    onChange={(e) => set(r.key, { debit: e.target.value, credit: e.target.value ? "" : r.credit })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-right tabular-nums"
                    inputMode="decimal"
                    value={r.credit}
                    aria-label={`Line ${i + 1} credit`}
                    onChange={(e) => set(r.key, { credit: e.target.value, debit: e.target.value ? "" : r.debit })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && i === rows.length - 1) {
                        e.preventDefault();
                        addLine();
                      }
                    }}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <Button variant="ghost" size="icon-sm" disabled={rows.length <= 2} aria-label={`Remove line ${i + 1}`} title="Remove line" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40 text-sm font-medium">
              <td colSpan={3} className="px-2 py-2">
                <Button variant="outline" size="sm" onClick={addLine} title="Add a line (it starts with what still balances the journal)">
                  <Plus /> Line
                </Button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{amount(t.debit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{amount(t.credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-sm tabular-nums ${t.difference === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {t.difference === 0 ? (t.debit ? "Balanced" : "Enter the amounts") : `Difference ${amount(Math.abs(t.difference))} ${t.difference > 0 ? "more debit" : "more credit"}`}
        </span>
        {problem && t.difference === 0 && t.debit > 0 && <span className="text-sm text-muted-foreground">{problem}</span>}
        <span className="ml-auto text-xs text-muted-foreground">A posted journal cannot be edited, only reversed.</span>
        <Button pending={pending} disabled={!can} onClick={save} title="Post (Ctrl+S)">
          <Save /> Post journal
        </Button>
      </div>
    </div>
  );
}

/** The stock count: pick the day, see what the books say, enter what the stock is worth. */
export function ClosingStockForm({ date, book, today }: { date: string; book: number; today: string }) {
  const [pending, run, router] = useRun();
  const [value, setValue] = useState("");
  const diff = value.trim() ? Math.round((book - num(value)) * 100) / 100 : null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="cs-date">Stock on</Label>
        <Input id="cs-date" type="date" max={today} value={date} onChange={(e) => e.target.value && router.replace(`/accounts/closing-stock?date=${e.target.value}`)} className="w-40" />
      </div>
      <div className="grid gap-1 text-sm">
        <span className="text-muted-foreground">Books say</span>
        <span className="h-9 font-medium tabular-nums">{amount(book)}</span>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cs-value">Stock is worth</Label>
        <Input id="cs-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="AED" className="w-40 text-right tabular-nums" />
      </div>
      <Button pending={pending} disabled={diff === null || diff === 0} onClick={() => run(() => postClosingStock({ date, value: num(value) }), "Closing stock posted", () => setValue(""))}>
        <Save /> Post
      </Button>
      {diff !== null && (
        <span className="pb-2 text-sm text-muted-foreground">
          {diff === 0 ? "The books already agree." : diff > 0 ? `${amount(diff)} moves to cost of goods sold.` : `${amount(-diff)} comes back from cost of goods sold.`}
        </span>
      )}
    </div>
  );
}

/** Reverses a hand-posted journal: its mirror image on the same day (or the day picked), with a reason. */
export function ReverseJournalDialog({ id, number, date, today }: { id: number; number: string; date: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [pending, run, router] = useRun();
  const [reason, setReason] = useState("");
  const [on, setOn] = useState(date);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setReason("");
          setOn(date);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Undo2 /> Reverse
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse {number}</DialogTitle>
          <DialogDescription>Posts the mirror image (debits become credits), so the two cancel out. Both stay on the books.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rv-date">Reversal date</Label>
          <Input id="rv-date" type="date" min={date} max={today} value={on} onChange={(e) => setOn(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rv-why">Why</Label>
          <Input id="rv-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Posted to the wrong account" maxLength={300} />
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={reason.trim().length < 3 || !on}
            onClick={() =>
              run(
                () => reverseJournal(id, { reason, date: on }),
                "Journal reversed",
                (r) => {
                  setOpen(false);
                  router.push(`/accounts/journals/${(r as { id: number }).id}`);
                },
              )
            }
          >
            <Undo2 /> Reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
