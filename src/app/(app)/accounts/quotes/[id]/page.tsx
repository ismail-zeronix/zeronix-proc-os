import { requireApp } from "@/lib/auth/session";
import { QuoteView } from "@/app/(app)/sales/quotes/[id]/quote-view";

export const metadata = { title: "Quote · Zeronix Accounts" };

export default async function Page({ params }: PageProps<"/accounts/quotes/[id]">) {
  return <QuoteView access={await requireApp("accounts")} base="/accounts" id={Number((await params).id)} />;
}
