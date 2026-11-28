import { ClipboardCheck, PlayCircle, Plus } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Kpi } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { inventoryOverview } from "@/lib/inventory/data";
import { currentOrgId } from "@/lib/org";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Inventory · Zeronix" };

/** Inventory overview: the item list in numbers, and whether stock has started moving with bills and invoices. */
export default async function InventoryPage() {
  const access = await requireApp("inventory");
  const o = await inventoryOverview(await currentOrgId());
  return (
    <div className="grid gap-3">
      <PageToolbar title="Inventory" meta={o.stockStart ? `Stock moves with bills and invoices since ${longDay(o.stockStart)}` : "Stock is not started yet"}>
        <div className="ml-auto flex gap-2">
          {!o.stockStart && access.accountant && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/inventory/settings#start" />}>
              <PlayCircle /> Start stock
            </Button>
          )}
          {o.stockStart && access.accountant && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/inventory/adjustments/new" />}>
              <ClipboardCheck /> Count or write off
            </Button>
          )}
          <Button size="sm" nativeButton={false} render={<Link href="/inventory/items" />}>
            <Plus /> Items
          </Button>
        </div>
      </PageToolbar>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active items" value={o.active} hint={`${o.goods} goods · ${o.services} services`} href="/inventory/items" />
        <Kpi label="Stock tracked" value={o.tracked} hint={`${o.serials} with serial numbers`} href="/inventory/items?view=stock" />
        <Kpi label="Stock value" value={access.finance ? money(o.value) : "-"} hint={access.finance ? "At average cost" : "Accounts team only"} href="/inventory/stock" />
        <Kpi label="Below reorder level" value={o.low} hint={o.short ? `${o.short} sold short, awaiting a bill` : `${o.categories} categor${o.categories === 1 ? "y" : "ies"}`} href={o.short ? "/inventory/stock?view=short" : "/inventory/stock?view=low"} />
      </div>
      {!o.stockStart && (
        <div className="grid gap-1 rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">How stock will work</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>Add your items (or import a CSV) and tick “Track stock” on the goods you keep in stock; tick “Serial numbers” for laptops, servers and the like.</li>
            <li>Pick items on quotes, orders, invoices and bills: the line keeps the link. Lines typed by hand still work as before.</li>
            <li>Once an accountant starts stock (Inventory › Settings: the start date and the opening count), supplier bills add to stock and invoices take from it, at average cost.</li>
            <li>Serial numbers are entered on the bill when units come in and picked on the invoice when they go out; Serial numbers finds where any unit is.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
