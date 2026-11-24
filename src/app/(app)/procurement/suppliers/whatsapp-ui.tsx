"use client";

import { Merge, Phone, Plus, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { errorText } from "@/lib/user-error";
import { addSupplierHandle, mergeSupplier, removeSupplierHandle } from "./actions";

interface Handle {
  id: number;
  kind: "phone" | "name";
  value: string;
}

/**
 * The WhatsApp numbers and names this supplier writes from: Claude's pushes are matched to the supplier through them.
 * They are learned by themselves when someone files a message in the Inbox; add one here when you already know it.
 */
export function SupplierWhatsApp({ supplierId, supplierName, handles, others }: { supplierId: number; supplierName: string; handles: Handle[]; others: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"phone" | "name">("phone");
  const [value, setValue] = useState("");
  const [merging, setMerging] = useState(false);
  const [into, setInto] = useState("");

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

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Messages Claude pushes from these numbers or names are filed under {supplierName}. A number or name can belong to one supplier only.
      </p>
      <div className="flex flex-wrap gap-2">
        {handles.map((h) => (
          <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pr-1 pl-2.5 text-sm">
            {h.kind === "phone" ? <Phone className="size-3.5 text-muted-foreground" /> : <User className="size-3.5 text-muted-foreground" />}
            {h.value}
            <button
              type="button"
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${h.value}`}
              disabled={pending}
              onClick={() => run(() => removeSupplierHandle(h.id), "Removed")}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {!handles.length && <span className="text-sm text-muted-foreground">None yet. They are added when you file this supplier&apos;s first message in the Inbox.</span>}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addSupplierHandle({ supplierId, kind, value }), "Added", () => setValue(""));
        }}
      >
        <NativeSelect size="sm" value={kind} onChange={(e) => setKind(e.target.value as "phone" | "name")} aria-label="Number or name" className="w-auto">
          <NativeSelectOption value="phone">Phone number</NativeSelectOption>
          <NativeSelectOption value="name">WhatsApp name</NativeSelectOption>
        </NativeSelect>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "phone" ? "+971 50 123 4567" : "As WhatsApp shows it"}
          aria-label={kind === "phone" ? "Phone number" : "WhatsApp name"}
          className="h-8 w-60"
        />
        <Button size="sm" type="submit" pending={pending} disabled={value.trim().length < 2}>
          <Plus /> Add
        </Button>
        <Button size="sm" type="button" variant="ghost" className="ml-auto" onClick={() => setMerging(true)}>
          <Merge /> Merge into another supplier
        </Button>
      </form>

      <Dialog
        open={merging}
        onOpenChange={(o) => {
          setMerging(o);
          if (o) setInto("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {supplierName}</DialogTitle>
            <DialogDescription>
              For a supplier that was added twice. Their price lists, offers, WhatsApp numbers and names move to the supplier you choose, and {supplierName} is removed.
              Not possible when Accounts has bills or payments for {supplierName}; then merge the other way round.
            </DialogDescription>
          </DialogHeader>
          <NativeSelect value={into} onChange={(e) => setInto(e.target.value)} aria-label="Merge into">
            <NativeSelectOption value="">Merge into…</NativeSelectOption>
            {others.map((o) => (
              <NativeSelectOption key={o.id} value={String(o.id)}>
                {o.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMerging(false)}>
              Cancel
            </Button>
            <Button
              pending={pending}
              disabled={!into}
              onClick={() =>
                start(async () => {
                  try {
                    await mergeSupplier(supplierId, Number(into));
                    toast.success("Merged");
                    setMerging(false);
                    router.replace(`/procurement/suppliers/${into}`);
                  } catch (e) {
                    toast.error(errorText(e));
                  }
                })
              }
            >
              <Merge /> Merge
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
