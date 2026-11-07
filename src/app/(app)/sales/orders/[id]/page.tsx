import { requireApp } from "@/lib/auth/session";
import { OrderView } from "./order-view";

export const metadata = { title: "Sales order · Zeronix Sales" };

export default async function Page({ params, searchParams }: PageProps<"/sales/orders/[id]">) {
  return <OrderView access={await requireApp("sales")} base="/sales" id={Number((await params).id)} searchParams={await searchParams} />;
}
