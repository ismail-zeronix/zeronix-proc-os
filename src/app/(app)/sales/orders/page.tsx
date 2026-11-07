import { requireApp } from "@/lib/auth/session";
import { OrdersView } from "./orders-view";

export const metadata = { title: "Sales orders · Zeronix Sales" };

export default async function Page({ searchParams }: PageProps<"/sales/orders">) {
  return <OrdersView access={await requireApp("sales")} base="/sales" searchParams={await searchParams} />;
}
