"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createOpeningInvoice } from "@/app/(app)/accounts/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dubaiToday } from "@/lib/dates";
import { TERMS_OPTIONS } from "@/lib/invoicing";

type Co = { id: number; name: string };

/**
 * Go-live: enter each customer invoice still unpaid in Zoho (its number, date and what is still owed), one after the
 * other. The dialog stays open for the next one; `company` fixes the customer (on a customer page).
 */
export function OpeningInvoiceDialog({ company }: { company?: Co }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const blank = { number: "", issueDate: "", termsDays: 30, total: "", customerRef: "" };
  const [f, setF] = useState(blank);
  const [co, setCo] = useState<Co | null>(company ?? null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const hits = useQuery<{ companies: Co[] }>({
    queryKey: ["opening-company", debounced],
    queryFn: () => fetch(`/api/sales/search?kind=company&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: open && !co && debounced.length >= 2,
  });
  const total = Number(f.total.replace(/,/g, ""));
  const can = !!co && !!f.number.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.issueDate) && total > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setF(blank);
          setCo(company ?? null);
          setQ("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title="Customer invoices still unpaid in Zoho when the portal started">
            <History /> Opening balance
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unpaid invoice from Zoho</DialogTitle>
          <DialogDescription>Enter what is still owed on it. Payments are then recorded here as usual. Not counted in sales or VAT.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="op-co">Customer</Label>
          {co ? (
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span className="truncate font-medium">{co.name}</span>
              {!company && (
                <Button variant="ghost" size="xs" onClick={() => setCo(null)}>
                  Change
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-1">
              <Input id="op-co" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the company name…" />
              {(hits.data?.companies ?? []).map((c) => (
                <button key={c.id} type="button" className="rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setCo({ id: c.id, name: c.name })}>
                  {c.name}
                </button>
              ))}
              {debounced.length >= 2 && hits.data && !hits.data.companies.length && <p className="px-1 text-xs text-muted-foreground">Not found. Add the company in CRM first.</p>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="op-no">Zoho invoice no.</Label>
            <Input id="op-no" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} maxLength={40} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op-date">Invoice date</Label>
            <Input id="op-date" type="date" max={dubaiToday()} value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op-terms">Credit terms</Label>
            <NativeSelect id="op-terms" value={String(f.termsDays)} onChange={(e) => setF({ ...f, termsDays: Number(e.target.value) })}>
              {TERMS_OPTIONS.map((t) => (
                <NativeSelectOption key={t} value={String(t)}>
                  {t === 0 ? "Cash" : `${t} days`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op-total">Still owed (AED)</Label>
            <Input id="op-total" inputMode="decimal" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} />
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="op-ref">Their PO (optional)</Label>
            <Input id="op-ref" value={f.customerRef} onChange={(e) => setF({ ...f, customerRef: e.target.value })} maxLength={60} />
          </div>
        </div>
        <DialogFooter>
          <Button
            pending={pending}
            disabled={!can}
            onClick={() =>
              start(async () => {
                try {
                  await createOpeningInvoice({ companyId: co!.id, number: f.number.trim(), issueDate: f.issueDate, termsDays: f.termsDays, total, customerRef: f.customerRef });
                  toast.success(`${f.number} added. Enter the next one, or close.`);
                  // stay open for the next invoice of the same customer
                  setF({ ...blank, termsDays: f.termsDays });
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            }
          >
            <Save /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
