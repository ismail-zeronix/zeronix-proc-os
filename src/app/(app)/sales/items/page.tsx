import { requireApp } from "@/lib/auth/session";
import { ItemsView } from "./items-view";

export const metadata = { title: "Items · Zeronix Sales" };

export default async function Page({ searchParams }: PageProps<"/sales/items">) {
  return <ItemsView access={await requireApp("sales")} base="/sales" searchParams={await searchParams} />;
}
