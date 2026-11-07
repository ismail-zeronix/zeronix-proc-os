"use client";

import { useRouter } from "next/navigation";
import { CustomerPicker, type PickedCustomer } from "@/components/party-pickers";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/** Step one of New credit note: whose invoice. The page then lists that customer's invoices. */
export function NoteCustomerPick({ value }: { value: PickedCustomer | null }) {
  const router = useRouter();
  return <CustomerPicker id="cn-co" value={value} onChange={(c) => router.replace(c ? `/accounts/credit-notes/new?company=${c.id}` : "/accounts/credit-notes/new")} />;
}

/** Step one of New debit note: whose bill. */
export function NoteSupplierPick({ value, suppliers }: { value: number | null; suppliers: { id: number; name: string }[] }) {
  const router = useRouter();
  return (
    <NativeSelect id="dn-sup" value={value ? String(value) : ""} onChange={(e) => router.replace(e.target.value ? `/accounts/debit-notes/new?supplier=${e.target.value}` : "/accounts/debit-notes/new")}>
      <NativeSelectOption value="">Pick the supplier</NativeSelectOption>
      {suppliers.map((s) => (
        <NativeSelectOption key={s.id} value={String(s.id)}>
          {s.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
