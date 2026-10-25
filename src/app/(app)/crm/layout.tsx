import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";

export default async function SalesLayout({ children }: LayoutProps<"/crm">) {
  await requireApp("crm");
  return <AppShell app="crm">{children}</AppShell>;
}
