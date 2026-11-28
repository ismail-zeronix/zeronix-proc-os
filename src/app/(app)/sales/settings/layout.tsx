import { SettingsShell } from "@/components/settings-shell";

export default async function SettingsLayout({ children }: LayoutProps<"/sales/settings">) {
  return (
    <SettingsShell home="sales" label="Sales settings">
      {children}
    </SettingsShell>
  );
}
