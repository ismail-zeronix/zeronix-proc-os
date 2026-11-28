"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/user-error";
import { setNegativeStock } from "../actions";

const OPTIONS = [
  { key: "allow", label: "Allow", hint: "The invoice goes out and stock goes below zero; its cost is posted when the supplier bill comes in (good for back-to-back sales)." },
  { key: "block", label: "Block", hint: "The invoice cannot be issued until enough stock has come in on a bill or the opening count." },
] as const;

/** Allow or block an invoice that sells more than is in stock. Only an accountant changes it. */
export function StockPolicy({ value, canChange }: { value: "allow" | "block"; canChange: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Selling more than is in stock">
      {OPTIONS.map((o) => (
        <label key={o.key} className="flex items-start gap-2 text-sm aria-disabled:opacity-60" aria-disabled={!canChange || pending}>
          <input
            type="radio"
            name="negative-stock"
            className="mt-1"
            checked={value === o.key}
            disabled={!canChange || pending}
            onChange={() =>
              start(async () => {
                try {
                  await setNegativeStock(o.key);
                  toast.success("Saved");
                  router.refresh();
                } catch (e) {
                  toast.error(errorText(e));
                }
              })
            }
          />
          <span className="grid leading-tight">
            {o.label}
            <span className="text-xs text-muted-foreground">{o.hint}</span>
          </span>
        </label>
      ))}
      {!canChange && <p className="text-xs text-muted-foreground">Only an accountant can change this.</p>}
    </div>
  );
}
