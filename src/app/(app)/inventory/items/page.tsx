import { ItemsView } from "@/app/(app)/sales/items/items-view";
import { requireApp } from "@/lib/auth/session";

export const metadata = { title: "Items · Zeronix Inventory" };

export default async function Page({ searchParams }: PageProps<"/inventory/items">) {
  return <ItemsView access={await requireApp("inventory")} base="/inventory" searchParams={await searchParams} />;
}
