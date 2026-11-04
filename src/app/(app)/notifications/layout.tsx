import { PortalHeader } from "@/components/portal-header";
import { requireAccess } from "@/lib/auth/session";

export default async function NotificationsLayout({ children }: LayoutProps<"/notifications">) {
  await requireAccess();
  return (
    <div className="flex min-h-svh flex-col pb-(--mobile-nav-h)">
      <PortalHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 p-3 md:p-4">{children}</div>
    </div>
  );
}
