"use client";

import { Lock, LockOpen, Pencil, Plus, Save } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAccountMap, saveBankAccount, saveDocumentDetails, saveFiscalYear, saveNumbering, saveVatRegistration, setLockDate, type BankAccountInput } from "@/app/(app)/accounts/settings-actions";
import { TreeNav, type TreeFolder } from "@/components/tree-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dubaiToday } from "@/lib/dates";
import { invoiceNumber, termsLabel, TERMS_OPTIONS } from "@/lib/invoicing";
import { BANK_KIND_LABELS, MONTHS, type BankKind } from "@/lib/ledger/settings-rules";
import { longDay, money } from "@/lib/quotation";
import { errorText } from "@/lib/user-error";

const FOLDERS: TreeFolder[] = [
  {
    label: "Company and tax",
    items: [
      { key: "/accounts/settings/vat", label: "VAT registration", hint: "TRN, emirate and VAT period", href: "/accounts/settings/vat" },
      { key: "/accounts/settings/tax-codes", label: "Tax codes", hint: "VAT codes and their return boxes", href: "/accounts/settings/tax-codes" },
    ],
  },
  {
    label: "Books",
    items: [
      { key: "/accounts/settings/books", label: "Financial year and lock date", hint: "When the year starts, and closing past periods", href: "/accounts/settings/books" },
      { key: "/accounts/settings/opening", label: "Opening balances", hint: "Cut-over date and balances from Zoho", href: "/accounts/settings/opening" },
    ],
  },
  { label: "Bank and cash", items: [{ key: "/accounts/settings/bank", label: "Bank and cash accounts", hint: "Add accounts, pick the default for each method", href: "/accounts/settings/bank" }] },
  { label: "Default accounts", items: [{ key: "/accounts/settings/default-accounts", label: "Posting accounts", hint: "Where each sales type and expense category posts", href: "/accounts/settings/default-accounts" }] },
  { label: "Numbering", items: [{ key: "/accounts/settings/numbering", label: "Document numbers", hint: "Invoice series and other documents", href: "/accounts/settings/numbering" }] },
  {
    label: "Documents",
    items: [
      { key: "/accounts/settings/templates", label: "Templates", hint: "Look of quotes, invoices and notes", href: "/accounts/settings/templates" },
      { key: "/accounts/settings/letterhead", label: "Letterhead", hint: "Contact lines, signature and stamp", href: "/accounts/settings/letterhead" },
      { key: "/accounts/settings/quotes", label: "Quote defaults", hint: "Margin, validity, terms and the quote email", href: "/accounts/settings/quotes" },
      { key: "/accounts/settings/documents", label: "Invoice defaults", hint: "Credit terms a new sale starts with", href: "/accounts/settings/documents" },
    ],
  },
];

/** The settings tree, on the same component as the reports tree. */
export function SettingsNav() {
  return <TreeNav label="Accounts settings" storageKey="accounts-settings" current={usePathname()} folders={FOLDERS} />;
}

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        after?.();
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const MonthSelect = ({ id, value, onChange, disabled }: { id: string; value: number; onChange: (m: number) => void; disabled?: boolean }) => (
  <NativeSelect id={id} value={String(value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
    {MONTHS.map((m, i) => (
      <NativeSelectOption key={m} value={String(i + 1)}>
        {m}
      </NativeSelectOption>
    ))}
  </NativeSelect>
);

export function VatForm({ initial, emirates }: { initial: { trn: string; emirate: string; vatPeriodMonths: number; vatPeriodStartMonth: number }; emirates: { value: string; label: string }[] }) {
  const [f, setF] = useState(initial);
  const [pending, run] = useSave();
  return (
    <Section title="VAT registration" hint="The TRN prints on every tax invoice, which cannot be issued without it.">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="v-trn">Our TRN</Label>
          <Input id="v-trn" value={f.trn} onChange={(e) => setF({ ...f, trn: e.target.value })} inputMode="numeric" maxLength={30} placeholder="15 digits" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="v-em">Emirate</Label>
          <NativeSelect id="v-em" value={f.emirate} onChange={(e) => setF({ ...f, emirate: e.target.value })}>
            {emirates.map((m) => (
              <NativeSelectOption key={m.value} value={m.value}>
                {m.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="v-len">VAT return</Label>
          <NativeSelect id="v-len" value={String(f.vatPeriodMonths)} onChange={(e) => setF({ ...f, vatPeriodMonths: Number(e.target.value) })}>
            <NativeSelectOption value="3">Every 3 months</NativeSelectOption>
            <NativeSelectOption value="1">Every month</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="v-start">First period starts in</Label>
          <MonthSelect id="v-start" value={f.vatPeriodStartMonth} onChange={(m) => setF({ ...f, vatPeriodStartMonth: m })} />
        </div>
      </div>
      <Button className="w-fit" size="sm" pending={pending} onClick={() => run(() => saveVatRegistration({ ...f, vatPeriodMonths: f.vatPeriodMonths as 1 | 3 }), "VAT registration saved")}>
        <Save /> Save
      </Button>
    </Section>
  );
}

export function FiscalYearForm({ month, locked }: { month: number; locked: boolean }) {
  const [m, setM] = useState(month);
  const [pending, run] = useSave();
  return (
    <Section title="Financial year" hint={locked ? "Fixed: the ledger already holds entries, which are numbered and reported by it." : "UAE companies usually run January to December."}>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="fy">The year starts in</Label>
        <MonthSelect id="fy" value={m} onChange={setM} disabled={locked} />
      </div>
      {!locked && (
        <Button className="w-fit" size="sm" pending={pending} disabled={m === month} onClick={() => run(() => saveFiscalYear(m), "Financial year saved")}>
          <Save /> Save
        </Button>
      )}
    </Section>
  );
}

export function LockDateForm({ lockDate }: { lockDate: string | null }) {
  const [day, setDay] = useState(lockDate ?? "");
  const [why, setWhy] = useState("");
  const [pending, run] = useSave();
  const movingBack = !!lockDate && (!day || day < lockDate);
  return (
    <Section title="Lock date" hint="Closes past periods: nothing can be posted on or before this day, by anyone. Set it after filing a VAT return or finishing a year.">
      <p className="flex items-center gap-1.5 text-sm">
        {lockDate ? <Lock className="size-4 text-amber-600" /> : <LockOpen className="size-4 text-muted-foreground" />}
        {lockDate ? `Locked up to ${longDay(lockDate)}` : "Not locked"}
      </p>
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ld">Locked up to and including</Label>
          <Input id="ld" type="date" max={dubaiToday()} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ld-why">{movingBack ? "Why reopen it (required)" : "Note"}</Label>
          <Input id="ld-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder={movingBack ? "Kept in the audit trail" : "e.g. Q3 VAT return filed"} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" pending={pending} disabled={(day || null) === lockDate || (movingBack && why.trim().length < 3)} onClick={() => run(() => setLockDate(day || null, why), day ? "Books locked" : "Books unlocked", () => setWhy(""))}>
          <Lock /> {day || !lockDate ? "Save lock date" : "Unlock"}
        </Button>
        {!!lockDate && !!day && (
          <Button size="sm" variant="ghost" onClick={() => setDay("")}>
            Clear
          </Button>
        )}
      </div>
    </Section>
  );
}

export interface BankRow {
  id: number;
  name: string;
  kind: BankKind;
  bankName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  holderName: string;
  isDefault: boolean;
  isActive: boolean;
  accountCode: string;
  balance: number;
}

function BankDialog({ row }: { row?: BankRow }) {
  const blank: BankAccountInput = { name: "", kind: "bank", bankName: "", accountNumber: "", iban: "", swift: "", holderName: "", isDefault: false, isActive: true };
  const start = row ? { name: row.name, kind: row.kind, bankName: row.bankName, accountNumber: row.accountNumber, iban: row.iban, swift: row.swift, holderName: row.holderName, isDefault: row.isDefault, isActive: row.isActive } : blank;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<BankAccountInput>(start);
  const [pending, run] = useSave();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(start);
      }}
    >
      <DialogTrigger
        render={
          row ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.name}`} title="Edit">
              <Pencil />
            </Button>
          ) : (
            <Button size="sm">
              <Plus /> Add account
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? row.name : "New bank or cash account"}</DialogTitle>
          <DialogDescription>{row ? `Ledger account ${row.accountCode}.` : "It gets its own account in the ledger, under Cash and bank."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="ba-name">Name</Label>
            <Input id="ba-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} placeholder="e.g. Emirates NBD current" />
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="ba-kind">Type</Label>
            <NativeSelect id="ba-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as BankKind })}>
              {(Object.keys(BANK_KIND_LABELS) as BankKind[]).map((k) => (
                <NativeSelectOption key={k} value={k}>
                  {BANK_KIND_LABELS[k]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {(f.kind === "bank" || f.kind === "card") && (
            <>
              <div className="col-span-2 grid gap-1.5">
                <Label htmlFor="ba-bank">Bank</Label>
                <Input id="ba-bank" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} maxLength={120} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ba-no">Account number</Label>
                <Input id="ba-no" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} maxLength={60} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ba-iban">IBAN</Label>
                <Input id="ba-iban" value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} maxLength={40} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ba-swift">SWIFT / BIC</Label>
                <Input id="ba-swift" value={f.swift ?? ""} onChange={(e) => setF({ ...f, swift: e.target.value })} maxLength={20} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ba-holder">Account holder</Label>
                <Input id="ba-holder" value={f.holderName ?? ""} onChange={(e) => setF({ ...f, holderName: e.target.value })} maxLength={120} placeholder="Our company name" />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">The default bank account prints on invoices and statements so customers know where to pay.</p>
            </>
          )}
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <Checkbox checked={!!f.isDefault} onCheckedChange={(v) => setF({ ...f, isDefault: !!v })} />
            The default on payment forms for {f.kind === "cash" || f.kind === "petty" ? "cash" : "bank transfers"}
          </label>
          {row && (
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <Checkbox checked={!!f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: !!v })} />
              In use
            </label>
          )}
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={(f.name ?? "").trim().length < 2} onClick={() => run(() => saveBankAccount(row?.id ?? null, f), "Account saved", () => setOpen(false))}>
            <Save /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BankAccountsList({ rows }: { rows: BankRow[] }) {
  return (
    <Section title="Bank and cash accounts" hint="Where money is kept. Payment forms offer the accounts of their method, starting with the default.">
      <div className="overflow-x-auto rounded-lg border">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Details</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Edit</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={r.isActive ? "" : "opacity-60"}>
                <TableCell className="py-1.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-1.5 inline-flex gap-1">
                    {r.isDefault && <Badge variant="secondary">Default</Badge>}
                    {!r.isActive && <Badge variant="outline">Off</Badge>}
                  </span>
                  <div className="font-mono text-xs text-muted-foreground">{r.accountCode}</div>
                </TableCell>
                <TableCell className="py-1.5 text-xs">{BANK_KIND_LABELS[r.kind]}</TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">{[r.bankName, r.accountNumber, r.iban].filter(Boolean).join(" · ") || "-"}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{money(r.balance)}</TableCell>
                <TableCell className="py-1.5">
                  <BankDialog row={r} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <BankDialog />
    </Section>
  );
}

export interface MapRow {
  key: string;
  label: string;
  group: string;
  type: "income" | "expense";
  accountId: number | null;
  usualId: number | null;
}

export function AccountMapForm({ rows, accounts }: { rows: MapRow[]; accounts: { id: number; code: string; name: string; type: string; isGroup: boolean }[] }) {
  const [map, setMap] = useState<Record<string, number | null>>(Object.fromEntries(rows.map((r) => [r.key, r.accountId ?? r.usualId])));
  const [pending, run] = useSave();
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <Section title="Posting accounts" hint="Where each sales type and expense category posts. Changing one affects new documents only: what is posted stays posted. Goods, customers, suppliers and VAT keep their own accounts.">
      <div className="grid gap-4">
        {groups.map((g) => (
          <div key={g} className="grid gap-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground">{g}</h3>
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <div key={r.key} className="grid items-center gap-1 sm:grid-cols-[16rem_minmax(0,24rem)] sm:gap-3">
                  <Label htmlFor={`m-${r.key}`} className="text-sm font-normal">
                    {r.label}
                  </Label>
                  <NativeSelect id={`m-${r.key}`} className="w-full" value={String(map[r.key] ?? "")} onChange={(e) => setMap({ ...map, [r.key]: Number(e.target.value) || null })}>
                    {accounts
                      .filter((a) => a.type === r.type && !a.isGroup)
                      .map((a) => (
                        <NativeSelectOption key={a.id} value={String(a.id)}>
                          {a.code} {a.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </div>
              ))}
          </div>
        ))}
      </div>
      <Button className="w-fit" size="sm" pending={pending} onClick={() => run(() => saveAccountMap(map), "Posting accounts saved")}>
        <Save /> Save
      </Button>
    </Section>
  );
}

export function NumberingForm({ initial, lastIssued, others }: { initial: { prefix: string; next: string; digits: string }; lastIssued: string | null; others: { label: string; pattern: string; last: string | null }[] }) {
  const [f, setF] = useState(initial);
  const [pending, run] = useSave();
  const preview = invoiceNumber(f.prefix, Math.max(1, Number(f.next) || 1), Number(f.digits) || 5);
  return (
    <>
      <Section title="Tax invoice numbers" hint="To continue from Zoho, set the next number to the one after your last Zoho invoice and match its prefix and digits.">
        <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="n-p">Prefix</Label>
            <Input id="n-p" value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} maxLength={20} placeholder="INV-" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="n-n">Next number</Label>
            <Input id="n-n" type="number" min={1} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="n-d">Digits</Label>
            <Input id="n-d" type="number" min={1} max={10} value={f.digits} onChange={(e) => setF({ ...f, digits: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Next invoice</span>
            <span className="flex h-8 items-center font-mono text-sm">{preview}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{lastIssued ? `Last invoice issued in the portal: ${lastIssued}.` : "No invoice has been issued in the portal yet."}</p>
        <Button className="w-fit" size="sm" pending={pending} onClick={() => run(() => saveNumbering({ invoice_prefix: f.prefix, invoice_next_number: Number(f.next), invoice_digits: Number(f.digits) }), "Numbering saved")}>
          <Save /> Save
        </Button>
      </Section>
      <Section title="Other documents" hint="These number themselves and restart every year, so there is nothing to set.">
        <div className="overflow-x-auto rounded-lg border">
          <Table cards>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Document</TableHead>
                <TableHead>Looks like</TableHead>
                <TableHead>Last one</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {others.map((o) => (
                <TableRow key={o.label}>
                  <TableCell className="py-1.5">{o.label}</TableCell>
                  <TableCell className="py-1.5 font-mono text-xs">{o.pattern}</TableCell>
                  <TableCell className="py-1.5 font-mono text-xs">{o.last ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </>
  );
}

/** Invoice defaults: the credit terms a new sale starts with. Bank details print from the default bank account. */
export function DocumentDetailsForm({ initial }: { initial: { default_terms_days: string } }) {
  const [f, setF] = useState(initial);
  const [pending, run] = useSave();
  return (
    <Section title="Invoice defaults" hint="What a new sale starts with. The bank details invoices print come from the default account in Bank and cash accounts.">
      <div className="grid max-w-md gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="d-terms">Default credit terms for new sales</Label>
          <NativeSelect id="d-terms" value={f.default_terms_days} onChange={(e) => setF({ ...f, default_terms_days: e.target.value })}>
            {TERMS_OPTIONS.map((t) => (
              <NativeSelectOption key={t} value={String(t)}>
                {termsLabel(t)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Button className="w-fit" size="sm" pending={pending} onClick={() => run(() => saveDocumentDetails({ default_terms_days: Number(f.default_terms_days) }), "Saved")}>
        <Save /> Save
      </Button>
    </Section>
  );
}
