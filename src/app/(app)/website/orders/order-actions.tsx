"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_LABEL, type OrderStatus } from "@/lib/website/store-core";
import { updateOrderAction } from "./actions";

const NEXT: Record<OrderStatus, OrderStatus | null> = { new: "confirmed", confirmed: "paid", paid: "shipped", shipped: "delivered", delivered: null, cancelled: null };

/** Status (one click to the next step, or pick any) and the team note, for one web order. */
export function OrderActions({ id, status, note }: { id: number; status: OrderStatus; note: string }) {
  const router = useRouter();
  const [s, setS] = useState(status);
  const [n, setN] = useState(note);
  const [pending, start] = useTransition();
  const save = (next: OrderStatus) =>
    start(async () => {
      const res = await updateOrderAction(id, next, n);
      if (res.error !== undefined) return void toast.error(res.error);
      toast.success(`Order is ${ORDER_LABEL[next].toLowerCase()}`);
      router.refresh();
    });
  const next = NEXT[status];
  return (
    <div className="grid content-start gap-2">
      {next && (
        <Button size="sm" pending={pending} onClick={() => save(next)}>
          Mark {ORDER_LABEL[next].toLowerCase()}
        </Button>
      )}
      <div className="flex gap-1.5">
        <NativeSelect aria-label="Status" value={s} onChange={(e) => setS(e.target.value as OrderStatus)} className="flex-1">
          {Object.entries(ORDER_LABEL).map(([k, v]) => (
            <NativeSelectOption key={k} value={k}>
              {v}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button size="sm" variant="outline" pending={pending} onClick={() => save(s)}>
          Save
        </Button>
      </div>
      <Textarea aria-label="Team note" rows={2} value={n} onChange={(e) => setN(e.target.value)} placeholder="Team note (payment link sent, delivery booked…)" className="text-xs" />
    </div>
  );
}
