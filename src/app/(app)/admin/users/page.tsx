import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { GRANTABLE_APPS, planApps } from "@/lib/apps";
import { requireApp } from "@/lib/auth/session";
import { teamMonth, todayLine } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { zeronixFeatures } from "@/lib/edition";
import { platformMailReady } from "@/lib/platform-mail";
import { AdminUsers, type TodayInfo } from "../admin-ui";
import { listUsers } from "../data";
import { InviteByLink } from "./invite-ui";
import { SupportVisits } from "./support-visits";

export const metadata = { title: "Users · Admin · Zeronix" };

export default async function AdminUsersPage() {
  const access = await requireApp("admin");
  const me = access.user;
  const today = dubaiToday();
  const [users, team, [org]] = await Promise.all([
    listUsers(),
    teamMonth(today.slice(0, 7)),
    db.select({ apps: schema.organizations.enabledApps }).from(schema.organizations).where(eq(schema.organizations.id, access.orgId)),
  ]);
  const todayBy: Record<number, TodayInfo> = {};
  for (const r of team) todayBy[r.user.id] = todayLine(r.data.cells.find((c) => c.day === today));
  const zeronix = zeronixFeatures();
  // the apps an admin can hand out: those in the organisation's plan (every app on Zeronix's own install)
  const grantable = planApps(
    GRANTABLE_APPS.map((a) => a.key),
    org?.apps ?? null,
    zeronix,
  );
  return (
    <div className="grid gap-3">
      <AdminUsers users={users} meId={me.id} today={todayBy} grantable={grantable} payroll={zeronix} />
      <InviteByLink mail={platformMailReady()} />
      <SupportVisits />
    </div>
  );
}
