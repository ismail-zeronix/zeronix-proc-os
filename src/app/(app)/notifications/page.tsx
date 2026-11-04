import { User, Users } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { requireAccess } from "@/lib/auth/session";
import { listFor, type ListFilter } from "@/lib/notifications";
import { teamOpen } from "@/lib/notifications/digest";
import { dueText, PRIORITY_DOT, PRIORITY_LABEL, PRIORITY_RANK, type Priority } from "@/lib/notifications/types";
import { NotificationList } from "./list";

export const metadata = { title: "Notifications · Zeronix" };

const STATES = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;
const PRIORITIES = Object.keys(PRIORITY_RANK) as Priority[];

/** Everything in my bell, with the resolved history. Admins also get the Team view: everyone's open critical and high alerts. */
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const { user } = await requireAccess();
  const isAdmin = user.role === "admin";
  const sp = await searchParams;
  const team = isAdmin && sp.view === "team";
  const viewSwitch = isAdmin && (
    <Segmented
      items={[
        { href: "/notifications", title: "My notifications", label: "Mine", icon: <User />, active: !team },
        { href: "/notifications?view=team", title: "Team: open critical and high alerts", label: "Team", icon: <Users />, active: team },
      ]}
    />
  );

  if (team) {
    const rows = await teamOpen();
    const people = [...new Set(rows.map((r) => r.userName))];
    return (
      <div className="grid gap-3">
        <PageToolbar title="Team alerts" meta={`${rows.length} open critical or high · ${people.length} ${people.length === 1 ? "person" : "people"}`}>
          {viewSwitch}
        </PageToolbar>
        {rows.length ? (
          people.map((p) => (
            <section key={p} className="rounded-lg border">
              <h2 className="border-b px-3 py-1.5 text-xs font-semibold">
                {p} <span className="font-normal text-muted-foreground">{rows.filter((r) => r.userName === p).length}</span>
              </h2>
              <div className="divide-y">
                {rows
                  .filter((r) => r.userName === p)
                  .map((r) => (
                    <Link key={r.id} href={r.link || "/notifications"} className="flex items-start gap-2 px-3 py-1.5 hover:bg-muted">
                      <span title={PRIORITY_LABEL[r.priority]} className={`mt-1.5 size-2 shrink-0 rounded-full ${PRIORITY_DOT[r.priority]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[r.dueAt ? dueText(r.dueAt.toISOString()) : "", r.body].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  ))}
              </div>
            </section>
          ))
        ) : (
          <p className="rounded-lg border px-3 py-10 text-center text-sm text-muted-foreground">Nobody has a critical or high alert open.</p>
        )}
      </div>
    );
  }

  const state = STATES.find((s) => s.key === sp.state)?.key ?? "open";
  const priority = PRIORITIES.find((p) => p === sp.priority);
  const filter: ListFilter = { state, priority };
  const items = await listFor(user.id, filter);
  const href = (next: Partial<{ state: string; priority: string }>) => {
    const q = new URLSearchParams();
    const s = next.state ?? state;
    const p = "priority" in next ? next.priority : priority;
    if (s !== "open") q.set("state", s);
    if (p) q.set("priority", p);
    const qs = q.toString();
    return `/notifications${qs ? `?${qs}` : ""}`;
  };
  const unread = items.filter((n) => !n.readAt && !n.resolvedAt).length;

  return (
    <div className="grid gap-3">
      <PageToolbar title="Notifications" meta={`${items.length} shown${unread ? ` · ${unread} unread` : ""}`}>
        {viewSwitch}
        <Segmented items={STATES.map((s) => ({ href: href({ state: s.key }), title: s.label, label: s.label, active: s.key === state }))} />
        <Segmented
          items={[
            { href: href({ priority: undefined }), title: "Any priority", label: "Any", active: !priority },
            ...PRIORITIES.map((p) => ({ href: href({ priority: p }), title: PRIORITY_LABEL[p], label: PRIORITY_LABEL[p], active: p === priority })),
          ]}
        />
      </PageToolbar>
      <NotificationList items={items} empty={state === "resolved" ? "Nothing resolved yet." : "All clear. Nothing needs you right now."} />
    </div>
  );
}
