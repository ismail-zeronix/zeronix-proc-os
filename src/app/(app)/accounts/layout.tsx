import { AppShell } from "@/components/app-shell";
import { accountsBadges } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";

export default async function AccountsLayout({ children }: LayoutProps<"/accounts">) {
  const access = await requireApp("accounts");
  const badges = await accountsBadges();
  return (
    <AppShell app="accounts" badges={badges} perms={{ accountant: access.accountant }}>
      {children}
    </AppShell>
  );
}
