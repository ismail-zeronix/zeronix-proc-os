import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { LIST_PAGE } from "@/components/list-page";
import { PageToolbar } from "@/components/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { listAdjustments } from "@/lib/inventory/data";
import { currentOrgId } from "@/lib/org";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Stock adjustments · Zeronix Inventory" };

const KIND_LABEL: Record<string, string> = { opening: "Opening count", count: "Stock count", write_off: "Write-off" };

/** Stock adjustments: the opening count, stock counts and write-offs (SA-…). */
export default async function AdjustmentsPage() {
  const access = await requireApp("inventory");
  const rows = await listAdjustments(await currentOrgId());
  const costs = access.finance;
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Stock adjustments" meta="Counts and write-offs; their value goes to Stock adjustments (5150)">
        {access.accountant && (
          <Button size="sm" className="ml-auto" nativeButton={false} render={<Link href="/inventory/adjustments/new" />}>
            <Plus /> New adjustment
          </Button>
        )}
      </PageToolbar>
      <DataTable
        noun="adjustment"
        total={rows.length}
        acrossPages={false}
        selectable={false}
        empty="No adjustments yet. The opening count is made when stock starts (Inventory › Settings)."
        columns={[{ label: "Number" }, { label: "Date", className: "hidden sm:table-cell" }, { label: "Kind" }, { label: "Reason", className: "hidden md:table-cell" }, { label: "Items", className: "hidden sm:table-cell text-right" }, ...(costs ? [{ label: "Value", className: "text-right" }] : [])]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/inventory/adjustments/${r.id}`,
          card: (
            <Link href={`/inventory/adjustments/${r.id}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className={`font-medium ${r.status === "void" ? "line-through" : ""}`}>{r.number}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {KIND_LABEL[r.kind]} · {longDay(r.date)}
                  {r.reason ? ` · ${r.reason}` : ""}
                </div>
              </div>
              {costs && <span className="text-sm tabular-nums">{money(r.totalValue)}</span>}
            </Link>
          ),
          cells: [
            <span key="n" className={`font-medium ${r.status === "void" ? "line-through" : ""}`}>
              <Link href={`/inventory/adjustments/${r.id}`} className="hover:underline">
                {r.number}
              </Link>
              {r.status === "void" && (
                <Badge variant="outline" className="ml-1.5">
                  Void
                </Badge>
              )}
            </span>,
            <span key="d">{longDay(r.date)}</span>,
            <span key="k">{KIND_LABEL[r.kind]}</span>,
            <span key="r" className="block max-w-72 truncate text-muted-foreground">
              {r.reason || "-"}
            </span>,
            <span key="i" className="tabular-nums">
              {r.lines}
            </span>,
            ...(costs
              ? [
                  <span key="v" className="tabular-nums">
                    {money(r.totalValue)}
                  </span>,
                ]
              : []),
          ],
        }))}
      />
    </div>
  );
}
