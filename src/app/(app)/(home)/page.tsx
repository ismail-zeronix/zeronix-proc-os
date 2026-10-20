import { AppTile } from "@/components/app-tile";
import { PageHeader } from "@/components/page-header";
import { visibleApps } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";

export const metadata = { title: "Home · Zeronix" };

export default async function HomePage() {
  const { user, apps } = await requireAccess();
  const tiles = visibleApps({ role: user.role, apps });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="grid gap-6">
      <PageHeader title={`${greeting}, ${user.name.split(" ")[0]}`} description="Pick an app to start." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((a) => (
          <AppTile key={a.key} app={a} />
        ))}
      </div>
    </div>
  );
}
