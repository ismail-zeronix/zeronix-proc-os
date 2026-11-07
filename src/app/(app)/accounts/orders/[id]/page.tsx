import { requireApp } from "@/lib/auth/session";
import { OrderView } from "@/app/(app)/sales/orders/[id]/order-view";

export const metadata = { title: "Sales order · Zeronix Accounts" };

export default async function Page({ params, searchParams }: PageProps<"/accounts/orders/[id]">) {
  return <OrderView access={await requireApp("accounts")} base="/accounts" id={Number((await params).id)} searchParams={await searchParams} />;
}
