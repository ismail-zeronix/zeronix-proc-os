import { requireApp } from "@/lib/auth/session";
import { CustomerAccountView } from "./customer-view";

export const metadata = { title: "Customer · Zeronix Sales" };

export default async function Page({ params, searchParams }: PageProps<"/sales/customers/[id]">) {
  return <CustomerAccountView access={await requireApp("sales")} base="/sales" id={Number((await params).id)} searchParams={await searchParams} />;
}
