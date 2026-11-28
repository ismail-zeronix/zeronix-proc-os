import { SettingsShell } from "@/components/settings-shell";

export default async function SettingsLayout({ children }: LayoutProps<"/crm/settings">) {
  return (
    <SettingsShell home="crm" label="CRM settings">
      {children}
    </SettingsShell>
  );
}
