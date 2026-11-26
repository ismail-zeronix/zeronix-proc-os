import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { SalesDocument } from "@/components/sales-document";
import { Button } from "@/components/ui/button";
import { requireAnyApp } from "@/lib/auth/any-app";
import { financeViewerOf } from "@/lib/auth/visibility";
import { deliveryDoc, proformaDoc } from "@/lib/doc-views";
import { getOrder } from "@/lib/orders-data";
import { quoteBrand } from "@/lib/quote-view";

export async function generateMetadata({ params, searchParams }: PageProps<"/print/order/[id]">) {
  const o = await getOrder(Number((await params).id), financeViewerOf(await requireAnyApp("sales", "accounts"))).catch(() => null);
  const dn = (await searchParams).doc === "delivery";
  return { title: o ? (dn ? `Delivery note ${o.dnNumber ?? o.number}` : `Proforma ${o.number}`) : "Sales order" };
}

/** Standard (our details) or Plain (none of our details, with prices and the total) delivery note. */
function DeliveryChoice({ id, plain }: { id: number; plain: boolean }) {
  const base = `/print/order/${id}?doc=delivery`;
  return (
    <div className="flex items-center rounded-md border bg-background p-0.5" role="group" aria-label="Delivery note format">
      <Button size="sm" variant={plain ? "ghost" : "secondary"} nativeButton={false} render={<Link href={base} replace />} title="With our company details">
        Standard
      </Button>
      <Button size="sm" variant={plain ? "secondary" : "ghost"} nativeButton={false} render={<Link href={`${base}&plain=1`} replace />} title="No company details: customer, items and total value only">
        Plain
      </Button>
    </div>
  );
}

/** Proforma invoice (default) or delivery note (?doc=delivery, &plain=1 for the version without our details) of an order. */
export default async function PrintOrder({ params, searchParams }: PageProps<"/print/order/[id]">) {
  const access = await requireAnyApp("sales", "accounts");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const o = await getOrder(id, financeViewerOf(access));
  if (!o) notFound();
  const sp = await searchParams;
  const dn = sp.doc === "delivery";
  if (dn && !o.dnNumber) notFound();
  const plain = dn && sp.plain === "1";
  const [brand, d] = await Promise.all([quoteBrand(), dn ? deliveryDoc(o, plain) : proformaDoc(o)]);
  return (
    <PrintPage back={`${access.apps.includes("sales") ? "/sales" : "/accounts"}/orders/${o.id}`} number={d.number} options={dn ? <DeliveryChoice id={o.id} plain={plain} /> : undefined}>
      <SalesDocument d={d} brand={plain ? { ...brand, plain: true } : brand} />
    </PrintPage>
  );
}
