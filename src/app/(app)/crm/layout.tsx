import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";

export default async function SalesLayout({ children }: LayoutProps<"/crm">) {
  const { seesAll } = await requireApp("crm");
  return (
    <AppShell app="crm" perms={{ seesAll }}>
      {children}
    </AppShell>
  );
}
