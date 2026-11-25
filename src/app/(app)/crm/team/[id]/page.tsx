import { eq } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Clock, FileText, Handshake, MessageSquareText, Phone, Receipt, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { StatStrip } from "@/components/stat-strip";
import { UserAvatar } from "@/components/user-avatar";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { countsSince } from "@/lib/check-in";
import { dubaiToday } from "@/lib/dates";
import { outcomeLabel, REACHED_OUTCOMES, type CallOutcome } from "@/lib/sales";
import { personDay, type DayEvent } from "@/lib/sales-kpis";
import { routineFor } from "@/lib/routine-data";

export const metadata = { title: "Salesman's day · CRM · Zeronix" };

const ICON: Record<DayEvent["kind"], typeof Clock> = {
  punch: Clock,
  deal: Handshake,
  prospect: Search,
  quote: Receipt,
  check_in: MessageSquareText,
  report: FileText,
};
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** One salesman's day, minute by minute: punches, calls and messages, prospects, quotes, check-ins, the report. */
export default async function PersonDayPage({ params, searchParams }: PageProps<"/crm/team/[id]">) {
  const access = await requireApp("crm");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) notFound();
  // the owner's view; a salesman may look at their own day
  if (!access.seesAll && access.user.id !== userId) notFound();
  const today = dubaiToday();
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today;
  const [[u], events, counts, routine] = await Promise.all([
    db.select({ name: schema.users.name, jobTitle: schema.users.jobTitle }).from(schema.users).where(eq(schema.users.id, userId)),
    personDay(userId, day),
    countsSince(userId, new Date(`${day}T00:00:00+04:00`), new Date(new Date(`${day}T00:00:00+04:00`).getTime() + 86400_000)),
    routineFor(userId),
  ]);
  if (!u) notFound();
  const t = routine?.targets;
  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/crm/team" />
        <UserAvatar name={u.name} size={32} />
        <div className="grid min-w-0 leading-tight">
          <h1 className="truncate text-base font-semibold">{u.name}</h1>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
        </div>
        <nav aria-label="Day" className="ml-auto flex items-center gap-1 text-xs">
          <Link href={`/crm/team/${userId}?day=${shift(day, -1)}`} replace className="inline-flex items-center rounded-md border px-2 py-1 hover:bg-muted">
            <ChevronLeft className="size-3.5" /> Day before
          </Link>
          {day < today && (
            <Link href={`/crm/team/${userId}?day=${shift(day, 1)}`} replace className="inline-flex items-center rounded-md border px-2 py-1 hover:bg-muted">
              Next day <ChevronRight className="size-3.5" />
            </Link>
          )}
        </nav>
      </div>

      <StatStrip
        items={[
          { label: "Calls", value: t ? `${counts.calls} / ${t.callsDay}` : counts.calls, hint: `${counts.reached} talked` },
          { label: "Messages · meetings", value: `${counts.messages} · ${counts.meetings}`, hint: `${counts.notes} notes` },
          { label: "New prospects", value: t ? `${counts.prospectsAdded} / ${t.prospectsDay}` : counts.prospectsAdded },
          { label: "Quotes sent", value: counts.quotesSent },
        ]}
      />

      {events.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">Nothing recorded on this day.</p>
      ) : (
        <ol className="grid gap-px overflow-hidden rounded-xl border bg-border text-sm">
          {events.map((e, i) => {
            const Icon = e.kind === "deal" && e.title.startsWith("Call") ? Phone : ICON[e.kind];
            const reached = e.outcome && REACHED_OUTCOMES.includes(e.outcome as CallOutcome);
            const body = (
              <>
                <span className={`font-medium ${e.tone === "warn" ? "text-amber-700 dark:text-amber-400" : ""}`}>{e.title}</span>
                {e.outcome && (
                  <span
                    className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${reached ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}
                  >
                    {outcomeLabel(e.outcome)}
                  </span>
                )}
                {e.detail && <div className="line-clamp-2 text-xs text-muted-foreground">{e.detail}</div>}
              </>
            );
            return (
              <li key={i} className="grid grid-cols-[3rem_1.25rem_minmax(0,1fr)] items-start gap-2 bg-card px-3 py-2">
                <span className="text-xs text-muted-foreground tabular-nums">{hm(e.at)}</span>
                <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                {e.link ? (
                  <Link href={e.link} className="min-w-0 hover:underline">
                    {body}
                  </Link>
                ) : (
                  <div className="min-w-0">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
