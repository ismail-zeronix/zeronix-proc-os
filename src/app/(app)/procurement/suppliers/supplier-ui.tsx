"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { CURRENCIES } from "@/lib/currency";
import { ago } from "@/lib/format";
import { SUPPLIER_TYPES, supplierType } from "@/lib/supplier-types";
import { saveSupplier } from "./actions";

interface SupplierRow {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  location: string;
  type: string;
  defaultCurrency: string;
  notes: string;
  isActive: boolean;
  lists: number;
  lastList: string | null;
  products: number;
}

export function SupplierDialog({ supplier }: { supplier?: SupplierRow }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    contactName: supplier?.contactName ?? "",
    phone: supplier?.phone ?? "",
    location: supplier?.location ?? "",
    type: supplier?.type ?? "market",
    defaultCurrency: supplier?.defaultCurrency ?? "AED",
    notes: supplier?.notes ?? "",
    isActive: supplier?.isActive ?? true,
  });
  const field = (k: keyof typeof form) => ({
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  const submit = () =>
    start(async () => {
      try {
        await saveSupplier({ id: supplier?.id, ...form, defaultCurrency: form.defaultCurrency as (typeof CURRENCIES)[number] });
        toast.success("Supplier saved");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          supplier ? (
            <Button variant="ghost" size="icon-sm" aria-label="Edit supplier" title="Edit supplier" />
          ) : (
            <Button variant="outline" size="icon-sm" aria-label="Add a supplier" title="Add a supplier" />
          )
        }
      >
        {supplier ? <Pencil /> : <Plus />}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "Add supplier"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input {...field("name")} placeholder="Aman Star IT DXB" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Contact person</Label>
              <Input {...field("contactName")} />
            </div>
            <div className="grid gap-1.5">
              <Label>WhatsApp / phone</Label>
              <Input {...field("phone")} placeholder="+971…" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <NativeSelect
                value={form.type}
                onChange={(e) => {
                  const t = supplierType(e.target.value);
                  // a new supplier takes the usual currency of its category; an existing one keeps its own
                  setForm({ ...form, type: t.key, defaultCurrency: supplier ? form.defaultCurrency : t.currency });
                }}
              >
                {SUPPLIER_TYPES.map((t) => (
                  <NativeSelectOption key={t.key} value={t.key}>
                    {t.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Quotes in</Label>
              <NativeSelect value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">{supplierType(form.type).description}</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Location</Label>
            <Input {...field("location")} placeholder="Dubai, Al Fahidi" />
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea {...field("notes")} placeholder="Payment terms, reliability, delivery time…" />
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: !!c })} />
            Active
          </Label>
        </div>
        <DialogFooter>
          <Button onClick={submit} pending={pending} disabled={form.name.trim().length < 2}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierTable({ rows }: { rows: SupplierRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Location</TableHead>
          <TableHead className="text-right">Price lists</TableHead>
          <TableHead className="text-right">Products</TableHead>
          <TableHead className="text-right">Last list</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.id} className={s.isActive ? "" : "opacity-50"}>
            <TableCell className="py-1.5 font-medium">
              <Link href={`/procurement/suppliers/${s.id}`} className="hover:underline">
                {s.name}
              </Link>
              {!s.isActive && <Badge variant="outline" className="ml-2">inactive</Badge>}
              {s.notes && <p className="max-w-xs truncate text-xs font-normal text-muted-foreground">{s.notes}</p>}
            </TableCell>
            <TableCell className="py-1.5">
              <SupplierTypeBadge type={s.type} />
            </TableCell>
            <TableCell className="py-1.5 text-sm">{[s.contactName, s.phone].filter(Boolean).join(" · ")}</TableCell>
            <TableCell className="py-1.5 text-sm">{s.location}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{s.lists}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{s.products}</TableCell>
            <TableCell className="py-1.5 text-right text-xs">{s.lastList ? ago(s.lastList) : "—"}</TableCell>
            <TableCell className="py-1.5">
              <SupplierDialog supplier={s} />
            </TableCell>
          </TableRow>
        ))}
        {!rows.length && (
          <TableRow>
            <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
              No suppliers in this category.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
