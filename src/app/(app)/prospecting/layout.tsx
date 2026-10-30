import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";

export default async function ProspectingLayout({ children }: LayoutProps<"/prospecting">) {
  await requireApp("prospecting");
  return <AppShell app="prospecting">{children}</AppShell>;
}
