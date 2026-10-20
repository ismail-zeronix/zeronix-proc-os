import { AppHeader } from "@/components/app-header";
import { visibleApps } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";

/** Server wrapper: reads who is signed in and what they may open, then renders the header. */
export async function PortalHeader({ withSidebar = false }: { withSidebar?: boolean }) {
  const { user, apps } = await requireAccess();
  const visible = visibleApps({ role: user.role, apps }).map((a) => a.key);
  return <AppHeader user={user} apps={apps} visible={visible} withSidebar={withSidebar} />;
}
