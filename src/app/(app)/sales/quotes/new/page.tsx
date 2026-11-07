import { requireApp } from "@/lib/auth/session";
import { NewQuoteView } from "./new-quote-view";

export const metadata = { title: "New quote · Zeronix Sales" };

export default async function Page({ searchParams }: PageProps<"/sales/quotes/new">) {
  return <NewQuoteView access={await requireApp("sales")} base="/sales" searchParams={await searchParams} />;
}
