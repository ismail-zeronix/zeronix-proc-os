import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { SalesDocument } from "@/components/sales-document";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { deliveryDoc, proformaDoc } from "@/lib/doc-views";
import { getOrder } from "@/lib/orders-data";
import { quoteBrand } from "@/lib/quote-view";

export async function generateMetadata({ params, searchParams }: PageProps<"/print/order/[id]">) {
  const o = await getOrder(Number((await params).id), viewerOf(await requireApp("sales"))).catch(() => null);
  const dn = (await searchParams).doc === "delivery";
  return { title: o ? (dn ? `Delivery note ${o.dnNumber ?? o.number}` : `Proforma ${o.number}`) : "Order" };
}

/** Proforma invoice (default) or delivery note (?doc=delivery) of an order. */
export default async function PrintOrder({ params, searchParams }: PageProps<"/print/order/[id]">) {
  const access = await requireApp("sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const o = await getOrder(id, viewerOf(access));
  if (!o) notFound();
  const dn = (await searchParams).doc === "delivery";
  if (dn && !o.dnNumber) notFound();
  const [brand, d] = await Promise.all([quoteBrand(), dn ? deliveryDoc(o) : proformaDoc(o)]);
  return (
    <PrintPage back={`/sales/orders/${o.id}`} number={d.number}>
      <SalesDocument d={d} brand={brand} />
    </PrintPage>
  );
}
