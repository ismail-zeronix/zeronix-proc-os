import { SettingsShell } from "@/components/settings-shell";

export default async function SettingsLayout({ children }: LayoutProps<"/projects/settings">) {
  return (
    <SettingsShell home="projects" label="Projects settings">
      {children}
    </SettingsShell>
  );
}
