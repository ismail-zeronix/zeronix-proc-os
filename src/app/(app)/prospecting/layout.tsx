import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";
import { reviewCount } from "@/lib/prospecting/outreach";

export default async function ProspectingLayout({ children }: LayoutProps<"/prospecting">) {
  await requireApp("prospecting");
  return (
    <AppShell app="prospecting" badges={{ review: await reviewCount() }}>
      {children}
    </AppShell>
  );
}
