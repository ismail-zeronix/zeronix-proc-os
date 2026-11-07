import { requireApp } from "@/lib/auth/session";
import { QuotesView } from "@/app/(app)/sales/quotes/quotes-view";

export const metadata = { title: "Quotes · Zeronix Accounts" };

export default async function Page({ searchParams }: PageProps<"/accounts/quotes">) {
  return <QuotesView access={await requireApp("accounts")} base="/accounts" searchParams={await searchParams} />;
}
