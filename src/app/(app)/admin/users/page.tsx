import { requireApp } from "@/lib/auth/session";
import { teamMonth, todayLine } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { AdminUsers, type TodayInfo } from "../admin-ui";
import { listUsers } from "../data";

export const metadata = { title: "Users · Admin · Zeronix" };

export default async function AdminUsersPage() {
  const me = (await requireApp("admin")).user;
  const today = dubaiToday();
  const [users, team] = await Promise.all([listUsers(), teamMonth(today.slice(0, 7))]);
  const todayBy: Record<number, TodayInfo> = {};
  for (const r of team) todayBy[r.user.id] = todayLine(r.data.cells.find((c) => c.day === today));
  return <AdminUsers users={users} meId={me.id} today={todayBy} />;
}
