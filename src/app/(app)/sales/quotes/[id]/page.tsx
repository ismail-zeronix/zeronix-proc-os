import { requireApp } from "@/lib/auth/session";
import { QuoteView } from "./quote-view";

export const metadata = { title: "Quote · Zeronix Sales" };

export default async function Page({ params }: PageProps<"/sales/quotes/[id]">) {
  return <QuoteView access={await requireApp("sales")} base="/sales" id={Number((await params).id)} />;
}
