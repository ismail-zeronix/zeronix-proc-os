import { AppShell } from "@/components/app-shell";
import { accountsBadges } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { billsDueCount } from "@/lib/purchases-data";

export default async function AccountsLayout({ children }: LayoutProps<"/accounts">) {
  const { finance } = await requireApp("accounts");
  // money badges are for the accounts team; below the finance level the sidebar has no money pages
  const [badges, billsDue] = finance ? await Promise.all([accountsBadges(), billsDueCount()]) : [{ overdue: 0, toInvoice: 0 }, 0];
  return (
    <AppShell app="accounts" badges={{ ...badges, billsDue }}>
      {children}
    </AppShell>
  );
}
