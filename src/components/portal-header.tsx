import { AppHeader } from "@/components/app-header";
import { visibleApps } from "@/lib/apps";
import { punchState, workHours } from "@/lib/attendance-data";
import { requireAccess } from "@/lib/auth/session";

/** Server wrapper: reads who is signed in and what they may open, then renders the header. */
export async function PortalHeader({ withSidebar = false }: { withSidebar?: boolean }) {
  const { user, apps, finance } = await requireAccess();
  const visible = visibleApps({ role: user.role, apps }).map((a) => a.key);
  const [{ punchedIn, since, closedMinutes }, hours] = await Promise.all([punchState(user.id), workHours()]);
  return (
    <AppHeader
      user={user}
      apps={apps}
      finance={finance}
      visible={visible}
      withSidebar={withSidebar}
      punch={{ punchedIn, since, closedMinutes, hours }}
    />
  );
}
