import { eq } from "drizzle-orm";
import { CalendarDays, IdCard } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { AttendanceCard, monthLabel, pickMonth } from "@/components/attendance/attendance-card";
import { StatStrip } from "@/components/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { db, schema } from "@/db";
import { allowedApps, APPS } from "@/lib/apps";
import { dubaiMinutes, formatDuration, formatHm } from "@/lib/attendance";
import { monthAttendance, punchState } from "@/lib/attendance-data";
import { requireApp } from "@/lib/auth/session";

export const metadata = { title: "User · Admin · Zeronix" };

/** One person for admins: a one-row header, the month in numbers, then attendance and details in tabs. */
export default async function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  await requireApp("admin");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) notFound();
  const [u] = await db
    .select({
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
      apps: schema.users.apps,
      dataScope: schema.users.dataScope,
      accountsLevel: schema.users.accountsLevel,
      jobTitle: schema.users.jobTitle,
      phone: schema.users.phone,
      mobile: schema.users.mobile,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u) notFound();
  const { month } = pickMonth(sp.month);
  const [punch, data] = await Promise.all([punchState(userId), monthAttendance(userId, month)]);
  const apps = allowedApps({ role: u.role, apps: u.apps });
  const { counts } = data;
  const daysIn = counts.present + counts.late;
  const away = counts.absent + counts.medical + counts.other;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/admin/users" />
        <UserAvatar name={u.name} size={32} />
        <div className="grid min-w-0 leading-tight">
          <h1 className="truncate text-base font-semibold">{u.name}</h1>
          <span className="truncate text-xs text-muted-foreground">{[u.jobTitle, u.email].filter(Boolean).join(" · ")}</span>
        </div>
        <Badge variant="outline" className="capitalize">
          {u.role}
        </Badge>
        {!u.isActive && <Badge variant="destructive">Disabled</Badge>}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
          <span className={`size-2 rounded-full ${punch.punchedIn ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-hidden />
          {punch.punchedIn && punch.since ? `In since ${formatHm(dubaiMinutes(new Date(punch.since)))}` : "Not punched in"}
          {punch.workedMinutes > 0 && <span className="text-muted-foreground">· {formatDuration(punch.workedMinutes)} today</span>}
        </span>
      </div>

      <StatStrip
        items={[
          {
            label: `Days in · ${monthLabel(month)}`,
            value: daysIn,
            hint: daysIn ? `${Math.round((counts.present / daysIn) * 100)}% on time` : undefined,
          },
          { label: "Late punch-ins", value: counts.late },
          {
            label: "Days away",
            value: away,
            hint: away ? `${counts.medical} medical · ${counts.other} other · ${counts.absent} no reason` : undefined,
          },
          {
            label: "Hours worked",
            value: formatDuration(data.totalMinutes),
            hint: daysIn ? `average ${formatDuration(data.totalMinutes / daysIn)} a day` : undefined,
          },
        ]}
      />

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">
            <CalendarDays /> Attendance
          </TabsTrigger>
          <TabsTrigger value="details">
            <IdCard /> Details
          </TabsTrigger>
        </TabsList>
        <TabsContent value="attendance" className="pt-1">
          <AttendanceCard userId={userId} month={month} canEdit basePath={`/admin/users/${userId}`} data={data} summary={false} />
        </TabsContent>
        <TabsContent value="details" className="pt-1">
          <dl className="grid gap-x-8 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Email" value={u.email} />
            <Field label="Phone" value={[u.phone, u.mobile].filter(Boolean).join(" · ") || "-"} />
            <Field label="Status" value={u.isActive ? "Active" : "Disabled"} />
            <Field label="Sales data" value={u.role === "admin" || u.dataScope === "all" ? "All data" : "Own deals only"} />
            <Field label="Accounts" value={u.role === "admin" || u.accountsLevel === "finance" ? "Finance: invoices, payments, purchases, reports" : "Sales: customers, quotes, orders"} />
            <Field
              label="Joined"
              value={u.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" })}
            />
            <Field
              label="Apps"
              className="sm:col-span-2 lg:col-span-4"
              value={APPS.filter((a) => apps.includes(a.key)).map((a) => a.label).join(", ") || "-"}
            />
          </dl>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-0.5 ${className}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
