import { requireApp } from "@/lib/auth/session";
import { CustomersView } from "./customers-view";

export const metadata = { title: "Customers · Zeronix Sales" };

export default async function Page({ searchParams }: PageProps<"/sales/customers">) {
  return <CustomersView access={await requireApp("sales")} base="/sales" searchParams={await searchParams} />;
}
