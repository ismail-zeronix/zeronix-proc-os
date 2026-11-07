import { requireApp } from "@/lib/auth/session";
import { CustomerAccountView } from "@/app/(app)/sales/customers/[id]/customer-view";

export const metadata = { title: "Customer · Zeronix Accounts" };

export default async function Page({ params, searchParams }: PageProps<"/accounts/customers/[id]">) {
  return <CustomerAccountView access={await requireApp("accounts")} base="/accounts" id={Number((await params).id)} searchParams={await searchParams} />;
}
