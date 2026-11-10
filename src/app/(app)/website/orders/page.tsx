import Link from "next/link";
import { Pager, PAGE_SIZE, pageParam } from "@/components/pager";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listOrders, orderCounts } from "@/lib/website/store";
import { ORDER_LABEL, ORDER_STATUSES, PAYMENT_LABEL, type OrderStatus } from "@/lib/website/store-core";
import { FileOutput } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { OrderActions } from "./order-actions";
import { SalesOrderDialog } from "./sales-order-dialog";
import { LIST_PAGE } from "@/components/list-page";

export const metadata = { title: "Orders · Zeronix Website" };

const aed = (v: string) => `AED ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Orders placed on the site's checkout, priced by the portal when they came in. */
export default async function OrdersPage({ searchParams }: PageProps<"/website/orders">) {
  await requireApp("website");
  const sp = await searchParams;
  const tab = String(sp.tab ?? "new");
  const status = (ORDER_STATUSES.find((s) => s === tab) ?? "new") as OrderStatus;
  const page = pageParam(sp.page);
  const [rows, counts] = await Promise.all([listOrders(status, page, PAGE_SIZE), orderCounts()]);

  return (
    <div className={LIST_PAGE}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Orders</h1>
        <nav className="flex flex-wrap gap-1">
          {ORDER_STATUSES.map((s) => (
            <Link key={s} href={`/website/orders?tab=${s}`} className={cn("rounded-md px-2.5 py-1 text-sm", status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {ORDER_LABEL[s]} <span className="tabular-nums opacity-70">{counts[s] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted-foreground">Checkout orders from the site. Prices include 5% VAT.</span>
      </div>
      {rows.length === 0 && <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No {ORDER_LABEL[status].toLowerCase()} orders.</p>}
      <ul className="grid gap-2">
        {rows.map((o) => (
          <li key={o.id} className="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[16rem_1fr_auto]">
            <div className="grid content-start gap-0.5 text-sm">
              <span className="font-semibold">
                {o.number} · {aed(o.total)}
              </span>
              <span>{o.name}</span>
              {o.company && (
                <span>
                  {o.company}
                  {o.trn ? ` · TRN ${o.trn}` : ""}
                </span>
              )}
              <a href={`mailto:${o.email}`} className="text-primary hover:underline">
                {o.email}
              </a>
              <a href={`tel:${o.phone}`} className="text-muted-foreground hover:underline">
                {o.phone}
              </a>
              <span className="text-xs text-muted-foreground">
                {ago(o.createdAt)}
                {o.customerId ? " · signed-in customer" : " · guest"}
              </span>
            </div>
            <div className="grid content-start gap-1.5 text-sm">
              <ul className="grid gap-1">
                {o.items.map((i) => (
                  <li key={i.productId} className="flex flex-wrap gap-x-2">
                    <span className="tabular-nums">{i.qty} ×</span>
                    <Link href={`/website/products/${i.productId}`} className="font-medium hover:underline">
                      {i.name}
                    </Link>
                    <span className="text-muted-foreground">{i.mpn}</span>
                    <span className="ml-auto tabular-nums">{aed((Number(i.unitPrice) * i.qty).toFixed(2))}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t pt-1.5 text-xs text-muted-foreground tabular-nums">
                {o.delivery === "delivery" && <>Delivery {Number(o.deliveryFee) ? aed(o.deliveryFee) : "free"} · </>}Before VAT {aed(o.subtotal)} · VAT {aed(o.vat)} · <span className="font-semibold text-foreground">Total {aed(o.total)}</span>
              </p>
              <p className="text-xs">
                <span className="font-medium">{PAYMENT_LABEL[o.payment]}</span> ·{" "}
                {o.delivery === "pickup" ? "Collect from our office" : [o.address.street, o.address.area, o.address.emirate].filter(Boolean).join(", ")}
              </p>
              {o.notes && <p className="text-xs whitespace-pre-wrap">Customer note: {o.notes}</p>}
            </div>
            <div className="grid content-start gap-2 lg:w-60">
              {o.salesOrderId && (
                <AppLink href={`/sales/orders/${o.salesOrderId}`} className={cn("inline-flex items-center gap-1.5 justify-self-start rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted", o.syncNote && "line-through opacity-70")}>
                  <FileOutput className="size-3.5 text-muted-foreground" /> {o.salesOrderNumber}
                </AppLink>
              )}
              {/* no Sales order yet, or the one it had was cancelled (the sync note says so) */}
              {(!o.salesOrderId || o.syncNote) && o.status !== "cancelled" && <SalesOrderDialog orderId={o.id} number={o.number} />}
              {o.syncNote && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{o.syncNote}</p>}
              <OrderActions id={o.id} status={o.status} note={o.internalNote} />
            </div>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-(--mobile-nav-h) z-20 -mx-1 mt-auto flex min-h-12 items-center border-t bg-background/95 py-2 pr-1 pl-1 backdrop-blur md:pr-20">
        <div className="ml-auto"><Pager path="/website/orders" params={sp} page={page} total={counts[status] ?? 0} showSingle /></div>
      </div>
    </div>
  );
}
