import { AppShell } from "@/components/app-shell";
import { accountsBadges } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { billsDueCount } from "@/lib/purchases-data";

export default async function AccountsLayout({ children }: LayoutProps<"/accounts">) {
  await requireApp("accounts");
  const [badges, billsDue] = await Promise.all([accountsBadges(), billsDueCount()]);
  return (
    <AppShell app="accounts" badges={{ ...badges, billsDue }}>
      {children}
    </AppShell>
  );
}
