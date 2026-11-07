import { requireApp } from "@/lib/auth/session";
import { NewQuoteView } from "@/app/(app)/sales/quotes/new/new-quote-view";

export const metadata = { title: "New quote · Zeronix Accounts" };

export default async function Page({ searchParams }: PageProps<"/accounts/quotes/new">) {
  return <NewQuoteView access={await requireApp("accounts")} base="/accounts" searchParams={await searchParams} />;
}
