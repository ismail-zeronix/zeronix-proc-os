import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { StatStrip } from "@/components/stat-strip";
import { Badge } from "@/components/ui/badge";
import { requireApp } from "@/lib/auth/session";
import { itemStockCard } from "@/lib/inventory/data";
import { currentOrgId } from "@/lib/org";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Stock card · Zeronix Inventory" };

const KIND: Record<string, string> = {
  opening: "Opening count",
  purchase: "Bought",
  sale: "Sold",
  sale_return: "Back from the customer",
  purchase_return: "Back to the supplier",
  adjust_in: "Count: more found",
  adjust_out: "Count or write-off",
  settle: "Cost of an earlier sale",
  void: "Voided",
};

/** One item's stock card: every unit in and out, with the document it moved on, and its serial numbers. */
export default async function StockCardPage({ params }: PageProps<"/inventory/items/[id]">) {
  const access = await requireApp("inventory");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const it = await itemStockCard(await currentOrgId(), id);
  if (!it) notFound();
  const costs = access.finance;
  const inStock = it.serials.filter((s) => s.status === "in_stock");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/inventory/stock" />
        <div className="grid min-w-0 leading-tight">
          <h1 className="truncate text-base font-semibold">{it.name}</h1>
          <span className="text-xs text-muted-foreground">{[it.sku, it.categoryName, it.brand, it.partNumber].filter(Boolean).join(" · ")}</span>
        </div>
        {!it.trackStock && <Badge variant="outline">Stock not tracked</Badge>}
        {!it.isActive && <Badge variant="outline">Off</Badge>}
      </div>
      <StatStrip
        items={[
          { label: "On hand", value: `${it.onHand} ${it.unit}` },
          { label: "Average cost", value: costs ? money(it.avgCost) : "-", hint: costs ? undefined : "Accounts team only" },
          { label: "Stock value", value: costs ? money(it.stockValue) : "-" },
          { label: "Reorder at", value: it.reorderLevel ?? "-" },
        ]}
      />
      {it.trackSerials && (
        <section className="grid gap-1.5 rounded-xl border bg-card p-3 text-sm">
          <h2 className="text-xs font-semibold text-muted-foreground">
            Serial numbers in stock ({inStock.length}){it.serials.length > inStock.length ? ` · ${it.serials.length - inStock.length} gone` : ""}
          </h2>
          {inStock.length ? (
            <div className="flex flex-wrap gap-1">
              {inStock.map((s) => (
                <span key={s.serial} className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
                  {s.serial}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">None in stock.</p>
          )}
          {it.serials.length > inStock.length && (
            <Link href="/inventory/serials" className="text-xs underline">
              Find a serial number that has gone
            </Link>
          )}
        </section>
      )}
      <section className="grid gap-1 rounded-xl border bg-card p-3 text-sm">
        <h2 className="text-xs font-semibold text-muted-foreground">Stock card{it.moves.length === 500 ? " (latest 500)" : ""}</h2>
        {it.moves.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">Date</th>
                  <th className="py-1 pr-2 font-medium">Document</th>
                  <th className="hidden py-1 pr-2 font-medium sm:table-cell">What</th>
                  <th className="py-1 pr-2 text-right font-medium">In</th>
                  <th className="py-1 pr-2 text-right font-medium">Out</th>
                  {costs && <th className="hidden py-1 pr-2 text-right font-medium md:table-cell">Value</th>}
                  <th className="py-1 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {it.moves.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="py-1 pr-2 whitespace-nowrap">{longDay(m.date)}</td>
                    <td className="py-1 pr-2">
                      {m.doc.href ? (
                        <Link href={m.doc.href} className="font-medium hover:underline">
                          {m.doc.number}
                        </Link>
                      ) : (
                        m.doc.number
                      )}
                      {m.doc.party && <div className="max-w-56 truncate text-xs text-muted-foreground">{m.doc.party}</div>}
                    </td>
                    <td className="hidden py-1 pr-2 text-muted-foreground sm:table-cell">
                      {KIND[m.kind] ?? m.kind}
                      {m.uncostedQty > 0 && <span className="text-amber-600 dark:text-amber-400"> · {m.uncostedQty} awaiting a bill</span>}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{m.qty > 0 ? m.qty : ""}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{m.qty < 0 ? -m.qty : ""}</td>
                    {costs && <td className="hidden py-1 pr-2 text-right text-xs tabular-nums md:table-cell">{money(m.value)}</td>}
                    <td className={`py-1 text-right tabular-nums ${m.qtyAfter < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{m.qtyAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">No stock has moved yet.</p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Prices, reorder level and the stock switches are edited in{" "}
        <Link href="/inventory/items" className="underline">
          Items
        </Link>
        .
      </p>
    </div>
  );
}
