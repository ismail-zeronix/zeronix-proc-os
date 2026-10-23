import { AppShell } from "@/components/app-shell";
import { accountsBadges } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";

export default async function AccountsLayout({ children }: LayoutProps<"/accounts">) {
  await requireApp("accounts");
  return (
    <AppShell app="accounts" badges={await accountsBadges()}>
      {children}
    </AppShell>
  );
}
