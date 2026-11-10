"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EMIRATES, markedUp, PAYMENT_LABEL, PAYMENT_METHODS, type StoreSettings } from "@/lib/website/store-core";
import { saveStoreAction } from "./actions";

/** The shop: markup on imported prices, how customers pay, and which mailbox sends sign-in codes and order emails. */
export function StoreForm({ store, mailboxes, owners, canEdit }: { store: StoreSettings; mailboxes: { userId: number; email: string; name: string }[]; owners: { id: number; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(store);
  const [pending, start] = useTransition();
  const patch = (p: Partial<StoreSettings>) => setF((x) => ({ ...x, ...p }));
  const patchDelivery = (p: Partial<StoreSettings["delivery"]>) => setF((x) => ({ ...x, delivery: { ...x.delivery, ...p } }));

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="markup">Markup on imported prices</Label>
          <div className="flex items-center gap-2">
            <Input id="markup" type="number" min={0} max={200} step={0.5} value={f.markupPercent} disabled={!canEdit} onChange={(e) => patch({ markupPercent: Number(e.target.value) || 0 })} className="w-24" />
            <span className="text-muted-foreground">%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Applied by Products › Import listing, rounded up to end in 9. Example: AED 4,149 becomes AED {Number(markedUp(4149, f.markupPercent)).toLocaleString("en-US")}. Prices you change by hand are not touched until the next import of that product.
        </p>
      </div>

      <div className="grid gap-1.5">
        <span className="font-medium">Ways to pay at checkout</span>
        {PAYMENT_METHODS.map((m) => (
          <label key={m} className="flex items-center gap-2">
            <Checkbox
              checked={f.payments.includes(m)}
              disabled={!canEdit}
              onCheckedChange={(on) => patch({ payments: on ? PAYMENT_METHODS.filter((x) => x === m || f.payments.includes(x)) : f.payments.filter((x) => x !== m) })}
            />
            {PAYMENT_LABEL[m]}
          </label>
        ))}
      </div>
      {f.payments.includes("bank") && (
        <div className="grid gap-1.5">
          <Label htmlFor="bank">Bank details (shown after ordering and in the order email)</Label>
          <Textarea id="bank" rows={4} value={f.bankDetails} disabled={!canEdit} onChange={(e) => patch({ bankDetails: e.target.value })} placeholder={"Bank: …\nAccount name: …\nIBAN: AE…"} />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="delivery">Delivery note</Label>
        <Input id="delivery" value={f.deliveryNote} disabled={!canEdit} onChange={(e) => patch({ deliveryNote: e.target.value })} />
      </div>
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="returns">Return window (days)</Label>
        <Input id="returns" type="number" min={0} max={365} step={1} value={f.returnDays} disabled={!canEdit} onChange={(e) => patch({ returnDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        <span className="text-xs text-muted-foreground">As your Delivery and warranty page says. Google shows it with your products. 0 = not shown.</span>
      </div>
      <div className="grid gap-2 rounded-md border p-3">
        <span className="font-medium">Delivery charge (AED, VAT included)</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="fee">Charge per order</Label>
            <Input id="fee" type="number" min={0} step={1} value={f.delivery.fee} disabled={!canEdit} onChange={(e) => patchDelivery({ fee: Number(e.target.value) || 0 })} />
            <span className="text-xs text-muted-foreground">0 = free delivery everywhere.</span>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="free">Free delivery from</Label>
            <Input id="free" type="number" min={0} step={50} value={f.delivery.freeAbove} disabled={!canEdit} onChange={(e) => patchDelivery({ freeAbove: Number(e.target.value) || 0 })} />
            <span className="text-xs text-muted-foreground">Orders at or above this total deliver free. 0 = no free-delivery amount.</span>
          </div>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">A different charge for some emirates</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            {EMIRATES.map((em) => (
              <div key={em} className="grid gap-1">
                <Label htmlFor={`fee-${em}`} className="text-xs">
                  {em}
                </Label>
                <Input
                  id={`fee-${em}`}
                  type="number"
                  min={0}
                  step={1}
                  placeholder={String(f.delivery.fee)}
                  value={f.delivery.emirateFees[em] ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const fees = { ...f.delivery.emirateFees };
                    if (e.target.value === "") delete fees[em];
                    else fees[em] = Math.max(0, Number(e.target.value) || 0);
                    patchDelivery({ emirateFees: fees });
                  }}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Empty = the normal charge. The free-delivery amount still applies. Collecting from the office is always free.</p>
        </details>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="mailbox">Send store emails from</Label>
          <NativeSelect id="mailbox" value={f.mailUserId ?? ""} disabled={!canEdit} onChange={(e) => patch({ mailUserId: e.target.value ? Number(e.target.value) : null })}>
            <NativeSelectOption value="">Nobody (sign-in off, no order emails)</NativeSelectOption>
            {mailboxes.map((m) => (
              <NativeSelectOption key={m.userId} value={m.userId}>
                {m.email} ({m.name})
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span className="text-xs text-muted-foreground">A mailbox connected in the Mail app. Sends sign-in codes and order confirmations as &quot;Zeronix Tech&quot;.</span>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notify">New orders go to</Label>
          <Input id="notify" type="email" value={f.notifyEmail} disabled={!canEdit} onChange={(e) => patch({ notifyEmail: e.target.value })} placeholder="sales@zeronix.ae" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="web-owner">Web orders go to (salesperson)</Label>
          <NativeSelect id="web-owner" value={f.webOrderOwnerId ?? ""} disabled={!canEdit} onChange={(e) => patch({ webOrderOwnerId: e.target.value ? Number(e.target.value) : null })}>
            <NativeSelectOption value="">Pick each time</NativeSelectOption>
            {owners.map((u) => (
              <NativeSelectOption key={u.id} value={u.id}>
                {u.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span className="text-xs text-muted-foreground">Suggested when a web order becomes a Sales order (Website › Orders › Create sales order).</span>
        </div>
      </div>
      {canEdit && (
        <Button
          size="sm"
          className="justify-self-start"
          pending={pending}
          onClick={() =>
            start(async () => {
              const res = await saveStoreAction(f);
              if (res.error !== undefined) return void toast.error(res.error);
              toast.success("Store settings saved");
              router.refresh();
            })
          }
        >
          Save
        </Button>
      )}
    </div>
  );
}
