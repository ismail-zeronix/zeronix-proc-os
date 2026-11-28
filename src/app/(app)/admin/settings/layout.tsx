import { PageToolbar } from "@/components/page-toolbar";
import { SettingsShell } from "@/components/settings-shell";

export const metadata = { title: "Settings · Admin · Zeronix" };

/** Admin › Settings: the company itself and what every app that prints shares, as a tree like Accounts settings. */
export default async function AdminSettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <div className="grid gap-3">
      <PageToolbar title="Settings" meta="The company, and what all its apps share" />
      <SettingsShell home="admin" label="Settings">
        {children}
      </SettingsShell>
    </div>
  );
}
