import { requireApp } from "@/lib/auth/session";
import { QuotesView } from "./quotes-view";

export const metadata = { title: "Quotes · Zeronix Sales" };

export default async function Page({ searchParams }: PageProps<"/sales/quotes">) {
  return <QuotesView access={await requireApp("sales")} base="/sales" searchParams={await searchParams} />;
}
