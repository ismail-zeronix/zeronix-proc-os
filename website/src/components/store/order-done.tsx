"use client";

import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Action } from "@/components/brand/action";
import { aed } from "./fields";

/** After checkout: the order number, what happens next, and the bank details when paying by transfer. */
export function OrderDone() {
  const sp = useSearchParams();
  const number = (sp.get("n") ?? "").slice(0, 20);
  const pay = sp.get("pay");
  const total = Number(sp.get("total") ?? 0);
  const [bank, setBank] = useState("");
  useEffect(() => {
    if (pay !== "bank") return;
    fetch("/api/store")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setBank(s?.bankDetails ?? ""))
      .catch(() => {});
  }, [pay]);

  return (
    <div className="mx-auto grid w-full max-w-lg justify-items-center gap-4 rounded-card border border-line/70 bg-white p-6 text-center">
      <CircleCheck className="size-12 text-forest-700" strokeWidth={1.5} />
      <h1 className="text-2xl font-semibold text-ink">Thank you for your order</h1>
      {number && (
        <p className="text-sm text-muted-ink">
          Order <span className="font-semibold text-ink">{number}</span>
          {total > 0 && <> · {aed(total)}</>}. A confirmation is on its way to your email.
        </p>
      )}
      {pay === "bank" && (
        <div className="grid w-full gap-1.5 rounded-xl bg-sage-50 p-4 text-left text-sm">
          <p className="font-semibold text-ink">Please pay by bank transfer, with {number || "your order number"} as the reference:</p>
          <p className="whitespace-pre-wrap text-ink">{bank || "Bank details are in your confirmation email."}</p>
        </div>
      )}
      {pay === "cod" && <p className="text-sm text-ink">You pay by cash or card when your order arrives. We will call you to arrange delivery.</p>}
      {pay === "request" && <p className="text-sm text-ink">We will confirm availability and send you a payment link or invoice, usually within a working day.</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Action href="/products">Continue shopping</Action>
        <Action href="/account" variant="outline" arrow={false}>
          My orders
        </Action>
      </div>
    </div>
  );
}
