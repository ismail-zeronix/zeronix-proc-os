"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, Save, Truck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCustomerFromAccounts } from "@/app/(app)/accounts/actions";
import { createSupplierFromAccounts } from "@/app/(app)/accounts/purchase-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TERMS_OPTIONS } from "@/lib/invoicing";
import { errorText } from "@/lib/user-error";

export type PickedCustomer = { id: number; name: string };

/**
 * A customer added in Accounts, with no lead or deal. `onAdded` keeps the person on the form they are filling in;
 * without it the new customer's page opens under `goTo`.
 */
export function NewCustomerDialog({ onAdded, defaultOpen = false, goTo, trigger }: { onAdded?: (c: PickedCustomer) => void; defaultOpen?: boolean; goTo?: string; trigger?: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const blank = { name: "", trn: "", address: "", emirate: "", phone: "" };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () =>
    start(async () => {
      try {
        const c = await createCustomerFromAccounts(f);
        toast.success(`${c.name} added`);
        setOpen(false);
        setF(blank);
        if (onAdded) onAdded({ id: c.id, name: c.name });
        else {
          router.push(`${goTo ?? "/accounts/customers"}/${c.id}`);
          router.refresh();
        }
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Building2 /> New customer
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>No lead or deal needed. It is the same company record CRM and Sales see.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nc-name">Name</Label>
            <Input id="nc-name" autoFocus value={f.name} onChange={set("name")} maxLength={200} placeholder="As on the tax invoice" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nc-trn">TRN</Label>
              <Input id="nc-trn" inputMode="numeric" value={f.trn} onChange={set("trn")} maxLength={30} placeholder="If VAT registered" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-phone">Phone</Label>
              <Input id="nc-phone" value={f.phone} onChange={set("phone")} maxLength={60} placeholder="Optional" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nc-addr">Billing address</Label>
            <Textarea id="nc-addr" rows={2} value={f.address} onChange={set("address")} maxLength={500} placeholder="Printed on invoices" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nc-emirate">Emirate</Label>
            <Input id="nc-emirate" value={f.emirate} onChange={set("emirate")} maxLength={60} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={f.name.trim().length < 2} onClick={save}>
            <Save /> Add customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Search for a customer by name, or add a new one without leaving the form. */
export function CustomerPicker({ id, value, onChange, locked = false }: { id: string; value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; locked?: boolean }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const hits = useQuery<{ companies: PickedCustomer[] }>({
    queryKey: ["customer-picker", debounced],
    queryFn: () => fetch(`/api/sales/search?kind=company&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: !value && debounced.length >= 2,
  });
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium" title={value.name}>
          {value.name}
        </span>
        {!locked && (
          <Button variant="ghost" size="icon-xs" aria-label="Pick another customer" onClick={() => onChange(null)}>
            <X />
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <div className="flex gap-1.5">
        <Input id={id} className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the customer's name…" autoComplete="off" />
        <NewCustomerDialog
          onAdded={onChange}
          trigger={
            <Button type="button" variant="outline" size="icon" title="Add a new customer" aria-label="Add a new customer">
              <Plus />
            </Button>
          }
        />
      </div>
      {(hits.data?.companies ?? []).map((c) => (
        <button key={c.id} type="button" className="rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => onChange({ id: c.id, name: c.name })}>
          {c.name}
        </button>
      ))}
      {debounced.length >= 2 && hits.data && !hits.data.companies.length && <p className="px-1 text-xs text-muted-foreground">Not found. Use + to add them.</p>}
    </div>
  );
}

export type PickedSupplier = { id: number; name: string; termsDays: number };

/**
 * A supplier added in Accounts, with what is needed to pay them. `onAdded` keeps the person on the form they are filling
 * in; without it the new supplier's page opens under `goTo`.
 */
export function NewSupplierDialog({ onAdded, defaultOpen = false, goTo, trigger }: { onAdded?: (s: PickedSupplier) => void; defaultOpen?: boolean; goTo?: string; trigger?: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const blank = { name: "", trn: "", email: "", address: "", termsDays: 30, bankName: "", iban: "" };
  const [f, setF] = useState(blank);
  const set = (k: Exclude<keyof typeof blank, "termsDays">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () =>
    start(async () => {
      try {
        const newId = await createSupplierFromAccounts(f);
        toast.success(`${f.name} added`);
        setOpen(false);
        setF(blank);
        if (onAdded) onAdded({ id: newId, name: f.name.trim(), termsDays: f.termsDays });
        else {
          router.push(`${goTo ?? "/accounts/suppliers"}/${newId}`);
          router.refresh();
        }
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" className="ml-auto">
              <Truck /> New supplier
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New supplier</DialogTitle>
          <DialogDescription>Only the name is needed now. The same supplier record Procurement sees.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ns-name">Name</Label>
            <Input id="ns-name" autoFocus value={f.name} onChange={set("name")} maxLength={160} placeholder="As on their invoice" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ns-trn">TRN</Label>
            <Input id="ns-trn" value={f.trn} onChange={set("trn")} maxLength={30} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ns-terms">We pay within</Label>
            <NativeSelect id="ns-terms" value={String(f.termsDays)} onChange={(e) => setF({ ...f, termsDays: Number(e.target.value) })}>
              {TERMS_OPTIONS.map((t) => (
                <NativeSelectOption key={t} value={String(t)}>
                  {t === 0 ? "Cash / on receipt" : `${t} days`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ns-addr">Address</Label>
            <Textarea id="ns-addr" rows={2} value={f.address} onChange={set("address")} maxLength={300} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ns-email">Accounts email</Label>
            <Input id="ns-email" type="email" value={f.email} onChange={set("email")} maxLength={200} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ns-bank">Bank</Label>
            <Input id="ns-bank" value={f.bankName} onChange={set("bankName")} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ns-iban">IBAN</Label>
            <Input id="ns-iban" value={f.iban} onChange={set("iban")} maxLength={40} />
          </div>
        </div>
        <DialogFooter>
          <Button pending={pending} disabled={f.name.trim().length < 2} onClick={save}>
            <Save /> Add supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
