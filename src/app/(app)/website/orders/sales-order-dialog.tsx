"use client";

import { FileOutput, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { EMIRATES } from "@/lib/website/store-core";
import { createSalesOrderAction, salesOrderDraftAction } from "./actions";

type Draft = NonNullable<Awaited<ReturnType<typeof salesOrderDraftAction>>["value"]>;

const aed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Website › Orders: turns a web order into a Sales order. Opens fresh every time (the draft is fetched on open): the
 * customer (a match by email, TRN or name, or a new one filled in from the order), the salesperson and the terms, with
 * the lines as Sales will show them (before VAT). Making it goes customer → instant quote → order in one click.
 */
export function SalesOrderDialog({ orderId, number }: { orderId: number; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<number | "new">("new");
  const [customer, setCustomer] = useState<Draft["newCustomer"]>({ name: "", trn: "", emirate: "", address: "", phone: "" });
  const [ownerId, setOwnerId] = useState<number | "">("");
  const [termsDays, setTermsDays] = useState(0);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    // a fresh start on every open: nothing typed last time is left behind
    setDraft(null);
    setError("");
    setLoading(true);
    void salesOrderDraftAction(orderId).then((res) => {
      setLoading(false);
      if (res.error !== undefined) return setError(res.error);
      const d = res.value;
      setDraft(d);
      setPick(d.matches[0]?.id ?? "new");
      setCustomer(d.newCustomer);
      setOwnerId(d.ownerId ?? "");
      setTermsDays(d.termsDays);
    });
  };

  const submit = () =>
    start(async () => {
      if (!ownerId) return void toast.error("Pick the salesperson");
      const res = await createSalesOrderAction(orderId, { companyId: pick === "new" ? null : pick, newCustomer: pick === "new" ? customer : undefined, ownerId, termsDays });
      if (res.error !== undefined) return void toast.error(res.error);
      toast.success(`Sales order ${res.value.number} made from ${number}`);
      setOpen(false);
      router.refresh();
    });

  const choice = "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <FileOutput /> Create sales order
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sales order from {number}</DialogTitle>
          <DialogDescription>Makes an instant quote and the order from it, with {number} as the customer reference. Delivery note, invoice and payment then follow in Sales and Accounts.</DialogDescription>
        </DialogHeader>
        {loading && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Looking for the customer…
          </p>
        )}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {draft && (
          <div className="grid max-h-[65dvh] min-w-0 grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto text-sm">
            <fieldset className="grid min-w-0 gap-1.5">
              <legend className="mb-1.5 font-medium">Customer</legend>
              {draft.matches.map((m) => (
                <label key={m.id} className={cn(choice, pick === m.id && "border-primary bg-primary/5")}>
                  <input type="radio" name="customer" className="mt-0.5" checked={pick === m.id} onChange={() => setPick(m.id)} />
                  <span className="grid">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[m.trn && `TRN ${m.trn}`, m.emirate, `matched by ${m.why}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              <label className={cn(choice, pick === "new" && "border-primary bg-primary/5")}>
                <input type="radio" name="customer" className="mt-0.5" checked={pick === "new"} onChange={() => setPick("new")} />
                <span className="font-medium">{draft.matches.length ? "Someone else: a new customer" : "New customer"}</span>
              </label>
              {pick === "new" && (
                <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-2">
                  <div className="grid gap-1 sm:col-span-2">
                    <Label htmlFor="c-name">Name on the invoice</Label>
                    <Input id="c-name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="c-trn">TRN</Label>
                    <Input id="c-trn" inputMode="numeric" value={customer.trn} onChange={(e) => setCustomer({ ...customer, trn: e.target.value })} placeholder="Leave empty for a person" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="c-emirate">Emirate</Label>
                    <NativeSelect id="c-emirate" value={customer.emirate} onChange={(e) => setCustomer({ ...customer, emirate: e.target.value })}>
                      <NativeSelectOption value="">Not set</NativeSelectOption>
                      {EMIRATES.map((x) => (
                        <NativeSelectOption key={x} value={x}>
                          {x}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1 sm:col-span-2">
                    <Label htmlFor="c-address">Billing address</Label>
                    <Input id="c-address" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
                  </div>
                </div>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="owner">Salesperson</Label>
                <NativeSelect id="owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : "")}>
                  <NativeSelectOption value="">Pick…</NativeSelectOption>
                  {draft.owners.map((u) => (
                    <NativeSelectOption key={u.id} value={u.id}>
                      {u.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="terms">Payment terms</Label>
                <NativeSelect id="terms" value={termsDays} onChange={(e) => setTermsDays(Number(e.target.value))}>
                  {[0, 7, 15, 30, 45, 60].map((d) => (
                    <NativeSelectOption key={d} value={d}>
                      {d === 0 ? "Due on receipt" : `${d} days`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="grid gap-1">
              <span className="font-medium">Lines in Sales (before VAT)</span>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-md border p-2 text-xs">
                {draft.preview.lines.map((l, i) => (
                  <li key={i} className="flex min-w-0 gap-2">
                    <span className="tabular-nums">{l.qty} ×</span>
                    <span className="min-w-0 flex-1 truncate">{l.description}</span>
                    <span className="shrink-0 tabular-nums">{aed(l.unitPriceAed * l.qty)}</span>
                  </li>
                ))}
                <li className="mt-1 flex justify-between border-t pt-1 font-medium">
                  <span>Total with 5% VAT</span>
                  <span className="tabular-nums">{aed(draft.preview.total)}</span>
                </li>
              </ul>
              {draft.preview.diff !== 0 && <p className="text-xs text-amber-700">Rounding leaves the Sales total {aed(Math.abs(draft.preview.diff))} off the web order. It is noted on the order.</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} pending={pending} disabled={!draft}>
            Create sales order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
