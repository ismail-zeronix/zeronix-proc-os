import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";

/** Inventory: traders only (lib/apps.ts appsForBusiness). */
export default async function InventoryLayout({ children }: LayoutProps<"/inventory">) {
  const { accountant } = await requireApp("inventory");
  return (
    <AppShell app="inventory" perms={{ accountant }}>
      {children}
    </AppShell>
  );
}
