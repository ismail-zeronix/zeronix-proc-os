import { SettingsNav } from "@/components/settings-ui";
import { requireAccountant } from "@/lib/auth/session";

export const metadata = { title: "Settings · Zeronix Accounts" };

/** Accounts settings: a tree of pages on the left, for accountants. */
export default async function AccountsSettingsLayout({ children }: LayoutProps<"/accounts/settings">) {
  await requireAccountant();
  return (
    <div className="grid min-w-0 items-start gap-3 md:grid-cols-[14.5rem_minmax(0,1fr)]">
      <SettingsNav />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">{children}</div>
    </div>
  );
}
