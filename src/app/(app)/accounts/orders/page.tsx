import { requireApp } from "@/lib/auth/session";
import { OrdersView } from "@/app/(app)/sales/orders/orders-view";

export const metadata = { title: "Sales orders · Zeronix Accounts" };

export default async function Page({ searchParams }: PageProps<"/accounts/orders">) {
  return <OrdersView access={await requireApp("accounts")} base="/accounts" searchParams={await searchParams} />;
}
