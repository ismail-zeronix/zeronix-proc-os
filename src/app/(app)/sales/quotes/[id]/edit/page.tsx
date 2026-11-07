import { requireApp } from "@/lib/auth/session";
import { EditQuoteView } from "./edit-quote-view";

export const metadata = { title: "Edit quote · Zeronix Sales" };

export default async function Page({ params }: PageProps<"/sales/quotes/[id]/edit">) {
  return <EditQuoteView access={await requireApp("sales")} base="/sales" id={Number((await params).id)} />;
}
