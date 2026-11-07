import { requireApp } from "@/lib/auth/session";
import { CustomersView } from "@/app/(app)/sales/customers/customers-view";

export const metadata = { title: "Customers · Zeronix Accounts" };

export default async function Page({ searchParams }: PageProps<"/accounts/customers">) {
  return <CustomersView access={await requireApp("accounts")} base="/accounts" searchParams={await searchParams} />;
}
