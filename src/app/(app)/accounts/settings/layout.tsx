import { SettingsShell } from "@/components/settings-shell";
import { requireAccountant } from "@/lib/auth/session";

export const metadata = { title: "Settings · Zeronix Accounts" };

/** Accounts settings: a tree of pages on the left, for accountants. */
export default async function AccountsSettingsLayout({ children }: LayoutProps<"/accounts/settings">) {
  await requireAccountant();
  return (
    <SettingsShell home="accounts" label="Accounts settings">
      {children}
    </SettingsShell>
  );
}
