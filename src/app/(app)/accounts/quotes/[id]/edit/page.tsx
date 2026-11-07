import { requireApp } from "@/lib/auth/session";
import { EditQuoteView } from "@/app/(app)/sales/quotes/[id]/edit/edit-quote-view";

export const metadata = { title: "Edit quote · Zeronix Accounts" };

export default async function Page({ params }: PageProps<"/accounts/quotes/[id]/edit">) {
  return <EditQuoteView access={await requireApp("accounts")} base="/accounts" id={Number((await params).id)} />;
}
