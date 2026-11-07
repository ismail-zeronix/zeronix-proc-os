"use client";

import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { paymentMethodOf } from "@/lib/ledger/settings-rules";

export interface BankOption {
  id: number;
  name: string;
  kind: string;
  isDefault: boolean;
}

/** Which account the money goes into or out of. Only asked when the method has more than one; otherwise its default is used. */
export function AccountPicker({ id, accounts, method, value, onChange }: { id: string; accounts: BankOption[]; method: "cash" | "bank"; value: number | null; onChange: (id: number | null) => void }) {
  const options = accounts.filter((a) => paymentMethodOf(a.kind) === method);
  if (options.length < 2) return null;
  const shown = options.some((o) => o.id === value) ? value : (options.find((o) => o.isDefault) ?? options[0]).id;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Account</Label>
      <NativeSelect id={id} value={String(shown)} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((o) => (
          <NativeSelectOption key={o.id} value={String(o.id)}>
            {o.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/** The account to send: what was picked, when it fits the method. Otherwise the server uses the method's default. */
export const pickedAccount = (accounts: BankOption[], method: "cash" | "bank", value: number | null) => {
  const options = accounts.filter((a) => paymentMethodOf(a.kind) === method);
  return options.some((o) => o.id === value) ? value : null;
};
