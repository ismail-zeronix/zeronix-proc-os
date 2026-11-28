import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { requireApp } from "@/lib/auth/session";
import { stockOnHand, type StockRow } from "@/lib/inventory/data";
import { matching, pageOf, readList, sortRows } from "@/lib/list-params";
import { currentOrgId } from "@/lib/org";
import { money } from "@/lib/quotation";
import { param } from "@/lib/sales-base";

export const metadata = { title: "Stock on hand · Zeronix Inventory" };

const low = (r: StockRow) => r.reorderLevel != null && r.available < r.reorderLevel;

const VIEWS = [
  { key: "all", label: "All", match: () => true },
  { key: "in", label: "In stock", match: (r: StockRow) => r.onHand > 0 },
  { key: "low", label: "Low", match: low },
  { key: "short", label: "Sold short", match: (r: StockRow) => r.onHand < 0 || r.uncosted > 0 },
] as const;

/** Stock on hand: what is on the shelf, what open orders already promise, and what is left to sell. */
export default async function StockPage({ searchParams }: PageProps<"/inventory/stock">) {
  const access = await requireApp("inventory");
  const sp = await searchParams;
  const all = await stockOnHand(await currentOrgId());
  const view = VIEWS.find((v) => v.key === param(sp.view)) ?? VIEWS[0];
  const path = "/inventory/stock";
  const list = readList(sp, ["name", "sku", "onHand", "available", "value"], { sort: "name", dir: "asc" });
  const found = matching(
    all.filter((r) => view.match(r)),
    list.q,
    (r) => [r.name, r.sku, r.categoryName],
  );
  const sorted = sortRows(found, { name: (r) => r.name.toLowerCase(), sku: (r) => r.sku.toLowerCase(), onHand: (r) => r.onHand, available: (r) => r.available, value: (r) => r.stockValue }, list);
  const rows = pageOf(sorted, list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={path} sp={sp} list={list} align={align} />;
  const costs = access.finance;
  const total = all.reduce((s, r) => s + r.stockValue, 0);
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Stock on hand" meta={`${all.length} items${costs ? ` · ${money(total)} at average cost` : ""}`}>
        <Segmented items={VIEWS.map((v) => ({ href: v.key === "all" ? path : `${path}?view=${v.key}`, label: `${v.label} ${all.filter((r) => v.match(r)).length}`, title: v.label, active: v.key === view.key }))} />
        <div className="ml-auto">
          <ListSearch placeholder="SKU or name…" />
        </div>
      </PageToolbar>
      <DataTable
        noun="item"
        total={found.length}
        acrossPages={false}
        selectable={false}
        pager={<ListPager path={path} sp={sp} list={list} total={found.length} />}
        empty={all.length ? "Nothing matches." : <span>No item tracks stock yet. Tick &ldquo;Track stock&rdquo; on the goods you keep in <Link href="/inventory/items" className="underline">Items</Link>.</span>}
        columns={[
          { label: head("Item", "name") },
          { label: head("SKU", "sku"), className: "hidden md:table-cell" },
          { label: head("On hand", "onHand", "right"), className: "text-right" },
          { label: "On orders", className: "hidden sm:table-cell text-right" },
          { label: head("Available", "available", "right"), className: "text-right" },
          { label: "Reorder at", className: "hidden lg:table-cell text-right" },
          ...(costs ? [{ label: "Avg cost", className: "hidden lg:table-cell text-right" }, { label: head("Value", "value", "right"), className: "hidden sm:table-cell text-right" }] : []),
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/inventory/items/${r.id}`,
          card: (
            <Link href={`/inventory/items/${r.id}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.sku} · {r.committed ? `${r.committed} on orders · ` : ""}
                  {r.available} available
                </div>
              </div>
              <span className={`text-sm tabular-nums ${r.onHand < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {r.onHand} {r.unit}
              </span>
            </Link>
          ),
          cells: [
            <div key="n" className="max-w-80 min-w-0">
              <Link href={`/inventory/items/${r.id}`} className="block truncate font-medium hover:underline">
                {r.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {[r.categoryName, r.trackSerials ? "Serials" : "", r.uncosted ? `${r.uncosted} sold awaiting a bill` : ""].filter(Boolean).join(" · ") || r.unit}
              </div>
            </div>,
            <span key="s" className="font-mono text-xs">
              {r.sku}
            </span>,
            <span key="h" className={`tabular-nums ${r.onHand < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{r.onHand}</span>,
            <span key="c" className="tabular-nums text-muted-foreground">
              {r.committed || "-"}
            </span>,
            <span key="a" className={`font-medium tabular-nums ${low(r) || r.available < 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
              {r.available}
            </span>,
            <span key="r" className="tabular-nums text-muted-foreground">
              {r.reorderLevel ?? "-"}
            </span>,
            ...(costs
              ? [
                  <span key="k" className="text-xs tabular-nums">
                    {r.avgCost ? money(r.avgCost) : "-"}
                  </span>,
                  <span key="v" className="tabular-nums">
                    {money(r.stockValue)}
                  </span>,
                ]
              : []),
          ],
        }))}
      />
    </div>
  );
}
