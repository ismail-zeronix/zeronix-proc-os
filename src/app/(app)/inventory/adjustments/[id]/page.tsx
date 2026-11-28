import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { LedgerEntries } from "@/components/ledger-entries";
import { Badge } from "@/components/ui/badge";
import { requireApp } from "@/lib/auth/session";
import { getAdjustment } from "@/lib/inventory/data";
import { currentOrgId } from "@/lib/org";
import { longDay, money } from "@/lib/quotation";
import { VoidAdjustmentButton } from "../../stock-ui";

export const metadata = { title: "Stock adjustment · Zeronix Inventory" };

const KIND_LABEL: Record<string, string> = { opening: "Opening count", count: "Stock count", write_off: "Write-off" };
const OFFSET_LABEL: Record<string, string> = { stock_adjustments: "Stock adjustments (5150)", opening_equity: "Opening balance equity", inventory: "Inventory (1310), goods bought before the start" };

/** One stock adjustment: what each line moved and its ledger entry. */
export default async function AdjustmentPage({ params }: PageProps<"/inventory/adjustments/[id]">) {
  const access = await requireApp("inventory");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const a = await getAdjustment(await currentOrgId(), id);
  if (!a) notFound();
  const costs = access.finance;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/inventory/adjustments" />
        <div className="grid min-w-0 leading-tight">
          <h1 className={`truncate text-base font-semibold ${a.status === "void" ? "line-through" : ""}`}>
            {a.number} · {KIND_LABEL[a.kind]}
          </h1>
          <span className="text-xs text-muted-foreground">
            {longDay(a.date)}
            {a.by ? ` · ${a.by}` : ""}
            {a.reason ? ` · ${a.reason}` : ""}
          </span>
        </div>
        {a.status === "void" && <Badge variant="outline">Void{a.voidReason ? `: ${a.voidReason}` : ""}</Badge>}
        <div className="ml-auto flex gap-2">
          {access.accountant && a.status === "posted" && a.kind !== "opening" && <VoidAdjustmentButton id={a.id} number={a.number} />}
          {access.accountant && a.status === "posted" && a.kind === "opening" && (
            <Link href="/inventory/settings#start" className="text-sm underline">
              Undo in Settings
            </Link>
          )}
        </div>
      </div>
      <section className="overflow-x-auto rounded-xl border bg-card text-sm">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Item</th>
              {a.kind === "count" && <th className="px-3 py-1.5 text-right font-medium">Counted</th>}
              <th className="px-3 py-1.5 text-right font-medium">Units</th>
              {costs && a.kind === "opening" && <th className="px-3 py-1.5 text-right font-medium">Cost per unit</th>}
              {costs && <th className="px-3 py-1.5 text-right font-medium">Value</th>}
            </tr>
          </thead>
          <tbody>
            {a.lines.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="px-3 py-1.5">
                  <Link href={`/inventory/items/${l.itemId}`} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{l.sku}</div>
                  {l.serials.length > 0 && <div className="mt-0.5 font-mono text-xs text-muted-foreground">{l.serials.join(", ")}</div>}
                </td>
                {a.kind === "count" && <td className="px-3 py-1.5 text-right tabular-nums">{l.countedQty ?? "-"}</td>}
                <td className={`px-3 py-1.5 text-right tabular-nums ${l.qty < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {l.qty > 0 ? `+${l.qty}` : l.qty} {l.unit}
                </td>
                {costs && a.kind === "opening" && <td className="px-3 py-1.5 text-right tabular-nums">{l.unitCost != null ? money(l.unitCost) : "-"}</td>}
                {costs && <td className="px-3 py-1.5 text-right tabular-nums">{money(l.value)}</td>}
              </tr>
            ))}
          </tbody>
          {costs && (
            <tfoot>
              <tr className="border-t font-medium">
                <td className="px-3 py-1.5" colSpan={a.kind === "count" ? 2 : 1}>
                  Total · against {OFFSET_LABEL[a.offset]}
                </td>
                <td />
                {a.kind === "opening" && <td />}
                <td className="px-3 py-1.5 text-right tabular-nums">{money(a.totalValue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
      {costs && <LedgerEntries refs={[{ sourceType: "stock_adjustment", sourceId: a.id }]} />}
    </div>
  );
}
