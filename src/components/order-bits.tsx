import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, PackageCheck, Receipt, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InvoiceStateKey } from "@/lib/invoicing";
import { orderStatusLabel } from "@/lib/invoicing";

const ORDER: Record<string, { icon: typeof Truck; cls: string }> = {
  open: { icon: Clock, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  delivered: { icon: Truck, cls: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  invoiced: { icon: PackageCheck, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  cancelled: { icon: Ban, cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

/** Confirmed / Delivered / Invoiced / Cancelled, always an icon and a word. */
export function OrderStatusBadge({ status }: { status: string }) {
  const { icon: Icon, cls } = ORDER[status] ?? ORDER.open;
  return (
    <Badge variant="secondary" className={cls}>
      <Icon /> {orderStatusLabel(status)}
    </Badge>
  );
}

const INV: Record<InvoiceStateKey, { icon: typeof Truck; cls: string }> = {
  unpaid: { icon: Receipt, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  part: { icon: CircleDashed, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  overdue: { icon: AlertTriangle, cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  paid: { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  cancelled: { icon: Ban, cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

/** Due in 5 days / Part paid / Overdue 12 days / Paid / Cancelled. */
export function InvoiceStateBadge({ state }: { state: { key: InvoiceStateKey; label: string } }) {
  const { icon: Icon, cls } = INV[state.key];
  return (
    <Badge variant="secondary" className={cls}>
      <Icon /> {state.label}
    </Badge>
  );
}
