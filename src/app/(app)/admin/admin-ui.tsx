"use client";

import { CheckCircle2, KeyRound, LayoutGrid, Plus, UserCheck, UserPlus, UserX, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageToolbar } from "@/components/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { allowedApps, GRANTABLE_APPS } from "@/lib/apps";
import { Textarea } from "@/components/ui/textarea";
import { invoiceNumber, termsLabel, TERMS_OPTIONS } from "@/lib/invoicing";
import { QUOTE_EMAIL_FIELDS } from "@/lib/quote-email";
import { createUser, saveDocumentSettings, saveQuoteSettings, saveSettings, saveWorkHours, updateUser } from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

export function AdminSettings({
  settings,
  models,
  health,
}: {
  settings: { llm_model: string; stale_days: string; fx_usd: string };
  models: string[];
  health: { ok: boolean; detail: string };
}) {
  const [model, setModel] = useState(settings.llm_model);
  const [stale, setStale] = useState(settings.stale_days);
  const [fx, setFx] = useState(settings.fx_usd);
  const [pending, run] = useAction();
  const options = models.includes(model) ? models : [model, ...models];

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI & comparison</CardTitle>
        <CardDescription className="flex items-center gap-2">
          {health.ok ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <XCircle className="size-4 text-destructive" />
          )}
          {health.detail}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_200px_200px_auto] md:items-start">
        <div className="grid gap-1.5">
          <Label>Local model (Ollama)</Label>
          <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
            {options.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            qwen3.5:4b gives the best accuracy on CPU (~3.4 GB RAM). qwen3.5:2b is ~20% faster but less accurate.
            Pull other models with <code>ollama pull &lt;name&gt;</code>.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label>Offer is “old” after (days)</Label>
          <Input type="number" min={1} max={365} value={stale} onChange={(e) => setStale(e.target.value)} />
          <p className="text-xs text-muted-foreground">Old offers are greyed and never win “best price”.</p>
        </div>
        <div className="grid gap-1.5">
          <Label>USD to AED rate</Label>
          <Input type="number" min={1} max={10} step={0.0001} value={fx} onChange={(e) => setFx(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Lets USD distributor prices rank against AED prices. Other currencies are only compared with themselves.
          </p>
        </div>
        <Button
          className="md:mt-[1.375rem]"
          pending={pending}
          onClick={() =>
            run(() => saveSettings({ llm_model: model, stale_days: Number(stale), fx_usd: Number(fx) }), "Settings saved")
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

export function QuoteSettings({
  settings,
}: {
  settings: {
    quote_margin_pct: string;
    quote_valid_days: string;
    quote_vat_pct: string;
    quote_terms: string;
    quote_trn: string;
    quote_email_subject: string;
    quote_email_body: string;
  };
}) {
  const [f, setF] = useState(settings);
  const [pending, run] = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quotes</CardTitle>
        <CardDescription>What a new quote starts with. Quotes already made keep the values they were made with.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="q-margin">Margin on cost (%)</Label>
          <Input id="q-margin" type="number" min={0} max={300} step={0.5} value={f.quote_margin_pct} onChange={set("quote_margin_pct")} />
          <p className="text-xs text-muted-foreground">Added to the supplier price when a salesperson picks it.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="q-days">Valid for (days)</Label>
          <Input id="q-days" type="number" min={1} max={180} value={f.quote_valid_days} onChange={set("quote_valid_days")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="q-vat">VAT (%)</Label>
          <Input id="q-vat" type="number" min={0} max={30} step={0.5} value={f.quote_vat_pct} onChange={set("quote_vat_pct")} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="q-terms">Terms printed on every quote</Label>
          <Textarea id="q-terms" rows={4} value={f.quote_terms} onChange={set("quote_terms")} />
          <p className="text-xs text-muted-foreground">One line each. The salesperson can change them on a single quote.</p>
        </div>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="q-mail-subject">Quote email: subject</Label>
          <Input id="q-mail-subject" value={f.quote_email_subject} onChange={set("quote_email_subject")} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="q-mail-body">Quote email: message (your signature is added below it)</Label>
          <Textarea id="q-mail-body" rows={10} value={f.quote_email_body} onChange={set("quote_email_body")} />
          <p className="text-xs text-muted-foreground">
            Filled in for each quote:{" "}
            {QUOTE_EMAIL_FIELDS.map((x, i) => (
              <span key={x.key}>
                {i > 0 && ", "}
                <code className="rounded bg-muted px-1">{`{${x.key}}`}</code> {x.meaning}
              </span>
            ))}
            . The quote PDF is attached.
          </p>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button pending={pending} onClick={() => run(() => saveQuoteSettings({ ...f, quote_trn: undefined }), "Quote settings saved")}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: "admin" | "sales";
  isActive: boolean;
  /** null = the role's default apps */
  apps: string[] | null;
  /** Which sales records they see: their own deals, or everyone's. */
  dataScope: "own" | "all";
  jobTitle: string;
}

/** Which apps one user can open: the role's defaults, or a list the admin picks. Admins always see every app. */
function UserApps({ user, disabled, run }: { user: UserRow; disabled: boolean; run: ReturnType<typeof useAction>[1] }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(user.apps !== null);
  const [picked, setPicked] = useState<string[]>(user.apps ?? allowedApps({ role: user.role }));
  if (user.role === "admin") return <span className="text-sm text-muted-foreground">All apps</span>;
  const count = user.apps === null ? "Role defaults" : `${user.apps.length} app${user.apps.length === 1 ? "" : "s"}`;
  const toggle = (key: string, on: boolean) => setPicked(on ? [...picked, key] : picked.filter((k) => k !== key));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" disabled={disabled} />}>
        <LayoutGrid /> {count}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={!custom} onCheckedChange={(v) => setCustom(!v)} /> Use role defaults
        </label>
        <div className="grid gap-1.5 border-t pt-2">
          {GRANTABLE_APPS.map((a) => (
            <label key={a.key} className="flex items-center gap-2 text-sm aria-disabled:opacity-50" aria-disabled={!custom}>
              <Checkbox
                disabled={!custom}
                checked={custom ? picked.includes(a.key) : allowedApps({ role: user.role }).includes(a.key)}
                onCheckedChange={(v) => toggle(a.key, !!v)}
              />
              {a.label}
              {a.status === "soon" && <span className="text-xs text-muted-foreground">(coming soon)</span>}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => {
            run(() => updateUser(user.id, { apps: custom ? picked : null }), "Apps saved");
            setOpen(false);
          }}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** What the Users table says about someone's day: green dot when punched in. */
export interface TodayInfo {
  punchedIn: boolean;
  label: string;
}

export function AdminUsers({ users, meId, today }: { users: UserRow[]; meId: number; today: Record<number, TodayInfo> }) {
  const [pending, run] = useAction();

  return (
    <div className="grid gap-3">
      <PageToolbar title="Users" meta={`${users.filter((u) => u.isActive).length} active · ${users.length} in total`}>
        <AddUserDialog run={run} pending={pending} />
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Person</TableHead>
              <TableHead className="hidden sm:table-cell">Today</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Apps</TableHead>
              <TableHead className="hidden md:table-cell" title="Which sales records they see">
                Data
              </TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="w-24 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const t = today[u.id];
              return (
                <TableRow key={u.id} className={u.isActive ? "" : "opacity-60"}>
                  <TableCell className="py-1.5">
                    <Link href={`/admin/users/${u.id}`} className="group flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={u.name} size={28} />
                      <span className="grid min-w-0 leading-tight">
                        <span className="truncate font-medium group-hover:underline">
                          {u.name} {u.id === meId && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{[u.jobTitle, u.email].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-xs whitespace-nowrap sm:table-cell">
                    {t ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-2 rounded-full ${t.punchedIn ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-hidden />
                        {t.label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <NativeSelect
                      size="sm"
                      value={u.role}
                      disabled={u.id === meId || pending}
                      aria-label={`Role of ${u.name}`}
                      onChange={(e) => run(() => updateUser(u.id, { role: e.target.value as "admin" | "sales" }), "Role updated")}
                    >
                      <NativeSelectOption value="sales">Sales</NativeSelectOption>
                      <NativeSelectOption value="admin">Admin</NativeSelectOption>
                    </NativeSelect>
                  </TableCell>
                  <TableCell className="hidden py-1.5 md:table-cell">
                    <UserApps key={`${u.id}-${u.role}-${u.apps?.join(",") ?? "-"}`} user={u} disabled={pending} run={run} />
                  </TableCell>
                  <TableCell className="hidden py-1.5 md:table-cell">
                    {u.role === "admin" ? (
                      <span className="text-sm text-muted-foreground">All data</span>
                    ) : (
                      <NativeSelect
                        size="sm"
                        value={u.dataScope}
                        disabled={pending}
                        aria-label={`Which sales records ${u.name} sees`}
                        title="Own deals: only deals they are assigned to (and their quotes, orders, invoices). All data: everyone's, like a sales manager."
                        onChange={(e) => run(() => updateUser(u.id, { dataScope: e.target.value as "own" | "all" }), "Data access saved")}
                      >
                        <NativeSelectOption value="own">Own deals</NativeSelectOption>
                        <NativeSelectOption value="all">All data</NativeSelectOption>
                      </NativeSelect>
                    )}
                  </TableCell>
                  <TableCell className="hidden py-1.5 md:table-cell">
                    <Badge variant={u.isActive ? "secondary" : "outline"}>{u.isActive ? "Active" : "Disabled"}</Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      pending={pending}
                      aria-label={`Reset password for ${u.name}`}
                      title="Reset password"
                      onClick={() => {
                        const pw = prompt(`New password for ${u.name} (min 8 characters)`);
                        if (pw) run(() => updateUser(u.id, { password: pw }), "Password changed");
                      }}
                    >
                      <KeyRound />
                    </Button>
                    {u.id !== meId && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        pending={pending}
                        aria-label={u.isActive ? `Disable ${u.name}` : `Enable ${u.name}`}
                        title={u.isActive ? "Disable" : "Enable"}
                        onClick={() => run(() => updateUser(u.id, { isActive: !u.isActive }), u.isActive ? "User disabled" : "User enabled")}
                      >
                        {u.isActive ? <UserX /> : <UserCheck />}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Admins see every app and all data, and manage users and settings. For sales users, pick which apps they can open and their data:
        <strong className="font-medium"> Own deals</strong> shows only the deals they are assigned to (with their quotes, orders and invoices);
        <strong className="font-medium"> All data</strong> shows everyone&apos;s, like a sales manager. Put several people on a deal to share it. Click a person for
        their attendance.
      </p>
    </div>
  );
}

function AddUserDialog({ run, pending }: { run: ReturnType<typeof useAction>[1]; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const blank = { name: "", email: "", password: "", role: "sales" as "admin" | "sales" };
  const [form, setForm] = useState(blank);
  const valid = !!form.name && !!form.email && form.password.length >= 8;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" aria-label="Add a user" title="Add a user" />}>
        <Plus />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>They sign in with this email and password. Sales users get the sales apps by default.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            run(async () => {
              await createUser(form);
              setForm(blank);
              setOpen(false);
            }, "User created");
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="nu-name">Name</Label>
            <Input id="nu-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nu-email">Email</Label>
            <Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nu-pw">Password</Label>
              <Input
                id="nu-pw"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="min 8 characters"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nu-role">Role</Label>
              <NativeSelect id="nu-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "sales" })}>
                <NativeSelectOption value="sales">Sales</NativeSelectOption>
                <NativeSelectOption value="admin">Admin</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" pending={pending} disabled={!valid}>
              <UserPlus /> Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Punch in / out rules: when work starts and ends, the fixed break, and weekly off days. */
export function WorkHoursSettings({
  settings,
}: {
  settings: { work_start: string; work_end: string; work_break_start: string; work_break_end: string; work_off_days: string };
}) {
  const [f, setF] = useState({
    work_start: settings.work_start,
    work_end: settings.work_end,
    work_break_start: settings.work_break_start,
    work_break_end: settings.work_break_end,
  });
  const [off, setOff] = useState<number[]>(
    settings.work_off_days.trim() ? settings.work_off_days.split(",").map(Number).filter((n) => n >= 0 && n <= 6) : [],
  );
  const [pending, run] = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const fields: [keyof typeof f, string][] = [
    ["work_start", "Work starts"],
    ["work_end", "Work ends"],
    ["work_break_start", "Break starts"],
    ["work_break_end", "Break ends"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Work hours</CardTitle>
        <CardDescription>
          Everyone punches in before using the portal. Punching in after the start, or out before the end (outside the break), asks
          for a reason. UAE time.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map(([k, label]) => (
            <div key={k} className="grid gap-1.5">
              <Label htmlFor={`wh-${k}`}>{label}</Label>
              <Input id={`wh-${k}`} type="time" value={f[k]} onChange={set(k)} />
            </div>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label>Weekly off days</Label>
          <div className="flex flex-wrap gap-3">
            {WEEK.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={off.includes(i)}
                  onCheckedChange={(c) => setOff(c ? [...off, i] : off.filter((x) => x !== i))}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Button pending={pending} onClick={() => run(() => saveWorkHours({ ...f, work_off_days: off }), "Work hours saved")}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type DocSettings = {
  quote_trn: string;
  invoice_prefix: string;
  invoice_next_number: string;
  invoice_digits: string;
  default_terms_days: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_iban: string;
  bank_swift: string;
};

/** Our TRN and bank details (printed on invoices), the invoice number series and the default credit terms. */
export function DocumentSettings({ settings, lastIssued }: { settings: DocSettings; lastIssued: string | null }) {
  const [f, setF] = useState<DocSettings>(settings);
  const [pending, run] = useAction();
  const set = (k: keyof DocSettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const preview = invoiceNumber(f.invoice_prefix, Math.max(1, Number(f.invoice_next_number) || 1), Number(f.invoice_digits) || 5);
  const field = (k: keyof DocSettings, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`doc-${k}`}>{label}</Label>
      <Input id={`doc-${k}`} value={f[k]} onChange={set(k)} {...extra} />
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>Printed on quotes, proformas and tax invoices. Company name, address and logo come from Email branding.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Tax invoice numbers</h3>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-4">
            {field("invoice_prefix", "Prefix", { placeholder: "INV-" })}
            {field("invoice_next_number", "Next number", { type: "number", min: 1 })}
            {field("invoice_digits", "Digits", { type: "number", min: 1, max: 10 })}
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Next invoice</span>
              <span className="flex h-8 items-center font-mono text-sm">{preview}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            To continue from Zoho, set the next number to the one after your last Zoho invoice and match its prefix and digits.
            {lastIssued ? ` Last invoice issued in the portal: ${lastIssued}.` : " No invoice has been issued in the portal yet."}
          </p>
        </section>
        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Tax and credit terms</h3>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            {field("quote_trn", "Our TRN (tax registration number)", { placeholder: "100XXXXXXXXXXX3" })}
            <div className="grid gap-1.5">
              <Label htmlFor="doc-terms">Default credit terms for new orders</Label>
              <NativeSelect id="doc-terms" value={f.default_terms_days} onChange={set("default_terms_days")}>
                {TERMS_OPTIONS.map((t) => (
                  <NativeSelectOption key={t} value={String(t)}>
                    {termsLabel(t)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </section>
        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Bank details for payment</h3>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            {field("bank_account_name", "Account name", { placeholder: "Zeronix Technology LLC" })}
            {field("bank_name", "Bank", { placeholder: "e.g. Emirates NBD" })}
            {field("bank_account_number", "Account number")}
            {field("bank_iban", "IBAN", { placeholder: "AE07 0331 2345 6789 0123 456" })}
            {field("bank_swift", "SWIFT / BIC")}
          </div>
        </section>
        <div>
          <Button pending={pending} onClick={() => run(() => saveDocumentSettings(f), "Document settings saved")}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
