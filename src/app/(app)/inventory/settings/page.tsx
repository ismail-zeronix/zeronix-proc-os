import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { businessTypeLabel } from "@/lib/apps";
import { dubaiToday } from "@/lib/dates";
import { inventoryOverview, stockItemOptions, stockStartInfo } from "@/lib/inventory/data";
import { currentOrgId } from "@/lib/org";
import { addDays, longDay, money } from "@/lib/quotation";
import { StartStockForm, UndoStartButton } from "../stock-ui";
import { StockPolicy } from "./settings-ui";

export const metadata = { title: "Settings · Zeronix Inventory" };

export default async function InventorySettingsPage() {
  const access = await requireApp("inventory");
  const orgId = await currentOrgId();
  const [o, start, items] = await Promise.all([inventoryOverview(orgId), stockStartInfo(orgId), access.accountant ? stockItemOptions(orgId) : []]);
  const today = dubaiToday();
  // the first day stock may start: the books' cut-over, and after the lock date
  const minDate = [start.cutover, start.lockDate ? addDays(start.lockDate, 1) : null].filter((d): d is string => !!d).sort().pop() ?? today;
  return (
    <div className="grid max-w-4xl gap-4">
      <PageToolbar title="Inventory settings" />
      <section className="grid gap-1 rounded-lg border p-4">
        <h2 className="text-sm font-medium">What the company does</h2>
        <p className="text-sm text-muted-foreground">
          {businessTypeLabel(access.businessType)}: items with stock, serial numbers and this app.{" "}
          {access.user.role === "admin" ? (
            <Link href="/admin/settings/company" className="underline">
              Change in Admin › Settings
            </Link>
          ) : (
            "An admin can change it in Admin › Settings."
          )}
        </p>
      </section>
      <section id="start" className="grid gap-3 rounded-lg border p-4">
        <div className="grid gap-1">
          <h2 className="text-sm font-medium">Stock start</h2>
          {start.stockStart ? (
            <p className="text-sm text-muted-foreground">
              Stock moves with bills and invoices dated from {longDay(start.stockStart)}.{" "}
              {start.opening ? (
                <>
                  Opening count{" "}
                  <Link href={`/inventory/adjustments/${start.opening.id}`} className="underline">
                    {start.opening.number}
                  </Link>
                  : {money(start.opening.totalValue)}.
                </>
              ) : (
                "It started with nothing on the shelf."
              )}{" "}
              Documents dated before the start never move stock.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not started. Pick the day stock starts and count what is on the shelf that morning. From then on supplier bills add to stock and invoices take from it, at average cost. Documents dated before the start never move stock.
            </p>
          )}
        </div>
        {start.stockStart ? (
          access.accountant && (
            <div>
              <UndoStartButton />
            </div>
          )
        ) : !access.accountant ? (
          <p className="text-sm text-muted-foreground">Only an accountant can start stock.</p>
        ) : !start.cutover ? (
          <p className="text-sm">
            Switch the books on first:{" "}
            <Link href="/accounts/settings/books" className="underline">
              Accounts › Settings › Books
            </Link>{" "}
            (the cut-over date). Stock is valued in the ledger.
          </p>
        ) : !items.length ? (
          <p className="text-sm">
            No item tracks stock yet. Tick &ldquo;Track stock&rdquo; on the goods you keep in{" "}
            <Link href="/inventory/items" className="underline">
              Items
            </Link>
            , then come back to count them.
          </p>
        ) : (
          <StartStockForm today={today} minDate={minDate > today ? today : minDate} balance1310={start.balance1310} items={items} />
        )}
      </section>
      <section className="grid gap-2 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Selling more than is in stock</h2>
        <StockPolicy value={o.negativeStock} canChange={access.accountant} />
      </section>
    </div>
  );
}
