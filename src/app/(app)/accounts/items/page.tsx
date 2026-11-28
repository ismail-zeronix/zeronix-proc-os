import { ItemsView } from "@/app/(app)/sales/items/items-view";
import { requireApp } from "@/lib/auth/session";

export const metadata = { title: "Items · Zeronix Accounts" };

export default async function Page({ searchParams }: PageProps<"/accounts/items">) {
  return <ItemsView access={await requireApp("accounts")} base="/accounts" searchParams={await searchParams} />;
}
