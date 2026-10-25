import { redirect } from "next/navigation";
import { requireApp } from "@/lib/auth/session";

/** Sales opens on its customers. */
export default async function SalesHome() {
  await requireApp("sales");
  redirect("/sales/customers");
}
