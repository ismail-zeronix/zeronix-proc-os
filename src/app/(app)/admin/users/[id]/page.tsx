import { desc, eq } from "drizzle-orm";
import { CalendarDays, IdCard, Target } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { AttendanceCard, monthLabel, pickMonth } from "@/components/attendance/attendance-card";
import { StatStrip } from "@/components/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { db, schema } from "@/db";
import { allowedApps, APPS, planApps } from "@/lib/apps";
import { zeronixFeatures } from "@/lib/edition";
import { dubaiMinutes, formatDuration, formatHm } from "@/lib/attendance";
import { monthAttendance, punchState } from "@/lib/attendance-data";
import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { money } from "@/lib/quotation";
import { CHECKIN_DONE, countsLine } from "@/lib/routine";
import { teamTargetsNow } from "@/lib/routine-data";
import { UserTargetsCard } from "../../routine-ui";

export const metadata = { title: "User · Admin · Zeronix" };

/** One person for admins: a one-row header, the month in numbers, then attendance and details in tabs. */
export default async function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const access = await requireApp("admin");
  // payroll and the sales routine are Zeronix's own (lib/edition.ts)
  const zeronix = zeronixFeatures();
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
      isAccountant: schema.users.isAccountant,
      jobTitle: schema.users.jobTitle,
      phone: schema.users.phone,
      mobile: schema.users.mobile,
      salesTargets: schema.users.salesTargets,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u) notFound();
  const [pay] = zeronix ? await db.select({ base: schema.employeePay.baseSalary }).from(schema.employeePay).where(eq(schema.employeePay.userId, userId)) : [];
  const { month } = pickMonth(sp.month);
  const [punch, data, team, reports, checkIns] = await Promise.all([
    punchState(userId),
    monthAttendance(userId, month),
    teamTargetsNow(),
    zeronix ? db.select().from(schema.dailyReports).where(eq(schema.dailyReports.userId, userId)).orderBy(desc(schema.dailyReports.day)).limit(14) : [],
    zeronix ? db.select().from(schema.checkIns).where(eq(schema.checkIns.userId, userId)).orderBy(desc(schema.checkIns.dueAt)).limit(20) : [],
  ]);
  // their apps as the organisation's plan allows them (the same rule as signing in)
  const [org] = await db.select({ apps: schema.organizations.enabledApps }).from(schema.organizations).where(eq(schema.organizations.id, access.orgId));
  const apps = planApps(allowedApps({ role: u.role, apps: u.apps }), org?.apps ?? null, zeronix);
  // the sales routine applies to sales users with the CRM app (lib/routine-data.ts isOnRoutine, before the off switch)
  const routineEligible = u.role === "sales" && apps.includes("crm");
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
          {zeronix && (
            <TabsTrigger value="routine">
              <Target /> Sales routine
            </TabsTrigger>
          )}
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
            {zeronix && <Field label="Monthly salary" value={<Link href="/accounts/payroll" className="hover:underline">{pay?.base ? money(pay.base) : "Not set"}</Link>} />}
            <Field label="Accountant" value={u.role === "admin" || u.isAccountant ? "Yes" : "No"} />
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
        {zeronix && (
        <TabsContent value="routine" className="grid gap-3 pt-1">
          <UserTargetsCard userId={userId} team={team} own={u.salesTargets} eligible={routineEligible} />
          <section aria-label="Check-ins" className="grid gap-1.5">
            <h2 className="text-sm font-medium text-muted-foreground">Check-ins (&quot;what have you done?&quot;)</h2>
            {checkIns.length === 0 ? (
              <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">No check-ins yet.</p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-xl border bg-border text-sm">
                {checkIns.map((ci) => (
                  <li key={ci.id} className="grid gap-1 bg-card px-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
                    <div className="grid content-start text-xs">
                      <span className="font-medium">
                        {ci.dueAt.toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                      </span>
                      <span className={ci.missed ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
                        {ci.answeredAt ? `${ci.missed ? "late, " : ""}answered ${formatHm(dubaiMinutes(ci.answeredAt))}` : "missed (no answer)"}
                      </span>
                    </div>
                    <div className="grid min-w-0 gap-0.5">
                      {ci.answeredAt && (
                        <>
                          <div className="text-xs text-muted-foreground">
                            {ci.done.map((d) => CHECKIN_DONE.find((x) => x.key === d)?.label ?? d).join(", ")}
                            {ci.counts && <> · counted: {countsLine(ci.counts)}</>}
                          </div>
                          <p className="break-words">{ci.note}</p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="End-of-day reports" className="grid gap-1.5">
            <h2 className="text-sm font-medium text-muted-foreground">End-of-day reports</h2>
            {reports.length === 0 ? (
              <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">No reports yet.</p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-xl border bg-border text-sm">
                {reports.map((r) => {
                  const c = r.counts;
                  return (
                    <li key={r.id} className="grid gap-1 bg-card px-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
                      <div className="grid content-start text-xs">
                        <span className="font-medium">
                          {new Date(`${r.day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        <span className="text-muted-foreground">sent {formatHm(dubaiMinutes(r.submittedAt))}</span>
                      </div>
                      <div className="grid min-w-0 gap-0.5">
                        <div className="text-xs text-muted-foreground tabular-nums">
                          <span className={c.calls < c.targets.callsDay ? "text-amber-700 dark:text-amber-400" : ""}>
                            {c.calls}/{c.targets.callsDay} calls
                          </span>{" "}
                          ({c.reached} talked) · {c.messages} messages · {c.meetings} meetings ·{" "}
                          <span className={c.prospectsAdded < c.targets.prospectsDay ? "text-amber-700 dark:text-amber-400" : ""}>
                            {c.prospectsAdded}/{c.targets.prospectsDay} new prospects
                          </span>
                          {r.moved > 0 && <> · {r.moved} follow-ups moved</>}
                          {c.checkIns && (
                            <span className={c.checkIns.missed ? "text-amber-700 dark:text-amber-400" : ""}>
                              {" "}
                              · check-ins {c.checkIns.answered} answered{c.checkIns.missed ? `, ${c.checkIns.missed} missed` : ""}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-line break-words">{r.note}</p>
                        {r.behindReason && <p className="text-xs text-amber-700 dark:text-amber-400">Behind: {r.behindReason}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </TabsContent>
        )}
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
