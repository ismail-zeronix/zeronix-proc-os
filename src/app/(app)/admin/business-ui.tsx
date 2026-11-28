"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/apps";
import { errorText } from "@/lib/user-error";
import { saveTaxRegistration, setBusinessType } from "./actions";

/** Admin › Settings › Company: trader or service provider. Decides the item fields and whether there is an Inventory app. */
export function BusinessTypeCard({ value }: { value: BusinessType | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 rounded-lg border bg-card px-3 py-3">
      <div>
        <h2 className="text-sm font-medium">What the company does</h2>
        {!value && <p className="text-xs text-amber-700 dark:text-amber-400">Not set yet: pick one so items show the right fields.</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What the company does">
        {BUSINESS_TYPES.map((b) => (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={value === b.key}
            disabled={pending}
            onClick={() =>
              value !== b.key &&
              start(async () => {
                try {
                  await setBusinessType(b.key);
                  toast.success(`Set to ${b.label.toLowerCase()}`);
                  router.refresh();
                } catch (e) {
                  toast.error(errorText(e));
                }
              })
            }
            className={`grid gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${value === b.key ? "border-foreground bg-muted/60" : "hover:bg-muted/40"}`}
          >
            <span className="font-medium">{b.label}</span>
            <span className="text-xs text-muted-foreground">{b.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Admin › Settings › Company: the TRN printed on quotes and tax invoices, and the emirate of the business. Here rather
 * than in Accounts, since a company may print quotes without using Accounts.
 */
export function TaxRegistrationCard({ initial, emirates }: { initial: { trn: string; emirate: string }; emirates: { value: string; label: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const changed = f.trn.trim() !== initial.trn || f.emirate !== initial.emirate;
  return (
    <div className="grid gap-2 rounded-lg border bg-card px-3 py-3">
      <div>
        <h2 className="text-sm font-medium">Tax registration</h2>
        <p className="text-xs text-muted-foreground">The TRN prints on every quote and tax invoice; a tax invoice cannot be issued without it.</p>
      </div>
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="t-trn">Our TRN</Label>
          <Input id="t-trn" value={f.trn} onChange={(e) => setF({ ...f, trn: e.target.value })} inputMode="numeric" maxLength={30} placeholder="15 digits" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="t-em">Emirate</Label>
          <NativeSelect id="t-em" value={f.emirate} onChange={(e) => setF({ ...f, emirate: e.target.value })}>
            {emirates.map((m) => (
              <NativeSelectOption key={m.value} value={m.value}>
                {m.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Button
        className="w-fit"
        size="sm"
        pending={pending}
        disabled={!changed}
        onClick={() =>
          start(async () => {
            try {
              await saveTaxRegistration({ trn: f.trn, emirate: f.emirate });
              toast.success("Tax registration saved");
              router.refresh();
            } catch (e) {
              toast.error(errorText(e));
            }
          })
        }
      >
        <Save /> Save
      </Button>
    </div>
  );
}
