import { CheckCircle2, Clock, FileEdit, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { quoteStatusLabel } from "@/lib/quotation";

const STYLE: Record<string, { icon: typeof Send; cls: string }> = {
  draft: { icon: FileEdit, cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  sent: { icon: Send, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  accepted: { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  rejected: { icon: XCircle, cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  expired: { icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
};

/** Draft / Sent / Accepted / Rejected / Expired, always an icon and a word. */
export function QuoteStatusBadge({ status }: { status: string }) {
  const { icon: Icon, cls } = STYLE[status] ?? STYLE.draft;
  return (
    <Badge variant="secondary" className={cls}>
      <Icon /> {quoteStatusLabel(status)}
    </Badge>
  );
}
