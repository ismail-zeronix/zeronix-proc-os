import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireApp("admin");
  return <AppShell app="admin">{children}</AppShell>;
}
