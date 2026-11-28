import { SettingsShell } from "@/components/settings-shell";

export default async function SettingsLayout({ children }: LayoutProps<"/procurement/settings">) {
  return (
    <SettingsShell home="procurement" label="Procurement settings">
      {children}
    </SettingsShell>
  );
}
