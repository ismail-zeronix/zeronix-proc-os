import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";

export default async function SalesLayout({ children }: LayoutProps<"/sales">) {
  await requireApp("sales");
  return <AppShell app="sales">{children}</AppShell>;
}
