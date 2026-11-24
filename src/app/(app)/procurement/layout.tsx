import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";
import { inboxCount } from "@/lib/procurement/intake";

export default async function ProcurementLayout({ children }: LayoutProps<"/procurement">) {
  await requireApp("procurement");
  return <AppShell app="procurement" badges={{ inbox: await inboxCount() }}>{children}</AppShell>;
}
