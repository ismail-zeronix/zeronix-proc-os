import { asc, eq } from "drizzle-orm";
import { ChevronRight, Plus, User, Users } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { TaskDialog, TaskItem } from "@/components/task-ui";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { groupOpen, listTasks, type TaskRow } from "@/lib/tasks";

export const metadata = { title: "Tasks · Zeronix" };

/** One list grouped by when things are due. Admins can switch to everyone's tasks, or one person's (avatars). */
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { user } = await requireApp("tasks");
  const isAdmin = user.role === "admin";
  const who = (await searchParams).who;
  // admins can look at everyone's tasks or one person's; everybody else sees their own
  const viewAll = isAdmin && who === "all";
  const viewId = isAdmin && who && who !== "all" && Number.isInteger(Number(who)) ? Number(who) : null;
  const userId = viewAll ? undefined : (viewId ?? user.id);

  const [{ open, done }, people] = await Promise.all([
    listTasks({ userId }),
    isAdmin
      ? db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.isActive, true))
          .orderBy(asc(schema.users.name))
      : Promise.resolve(undefined),
  ]);
  const g = groupOpen(open);
  const showAssignee = viewAll;
  const viewing = viewId ? people?.find((p) => p.id === viewId)?.name : null;

  const sections: { title: string; tasks: TaskRow[]; tone?: "bad" }[] = [
    { title: "Overdue", tasks: g.overdue, tone: "bad" },
    { title: "Today", tasks: g.today },
    { title: "Upcoming", tasks: g.upcoming },
    { title: "No date", tasks: g.undated },
  ].filter((s) => s.tasks.length > 0) as { title: string; tasks: TaskRow[]; tone?: "bad" }[];

  return (
    <div className="grid gap-3">
      <PageToolbar
        title={viewAll ? "All tasks" : viewing ? `${viewing}'s tasks` : "My tasks"}
        meta={`${open.length} open${g.overdue.length ? ` · ${g.overdue.length} overdue` : ""}`}
      >
        {isAdmin && (
          <>
            <Segmented
              items={[
                { href: "/tasks", title: "My tasks", label: "Mine", icon: <User />, active: !viewAll && !viewId },
                { href: "/tasks?who=all", title: "Everyone's tasks", label: "Everyone", icon: <Users />, active: viewAll },
              ]}
            />
            <div className="flex items-center gap-1" role="group" aria-label="One person's tasks">
              {people
                ?.filter((p) => p.id !== user.id)
                .map((p) => (
                  <Link
                    key={p.id}
                    href={`/tasks?who=${p.id}`}
                    title={`${p.name}'s tasks`}
                    aria-current={viewId === p.id ? "true" : undefined}
                    className={`rounded-full ring-offset-2 ring-offset-background ${viewId === p.id ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"}`}
                  >
                    <UserAvatar name={p.name} size={26} />
                  </Link>
                ))}
            </div>
          </>
        )}
        <TaskDialog
          people={people}
          trigger={
            <Button variant="outline" size="icon-sm" aria-label="Add a task" title="Add a task">
              <Plus />
            </Button>
          }
        />
      </PageToolbar>

      <div className="overflow-hidden rounded-lg border bg-card">
        {sections.length === 0 && <Empty>Nothing open. Add a task with +, or enjoy the quiet.</Empty>}
        {sections.map((s) => (
          <section key={s.title} aria-label={s.title}>
            <h2
              className={`flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold ${
                s.tone === "bad" ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {s.title}
              <span className="font-normal tabular-nums">{s.tasks.length}</span>
            </h2>
            <div className="grid gap-px p-1">
              {s.tasks.map((t) => (
                <TaskItem key={t.id} task={t} people={people} showAssignee={showAssignee} />
              ))}
            </div>
          </section>
        ))}
        {done.length > 0 && (
          <details className="group/done border-t first:border-t-0">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <ChevronRight className="size-3.5 transition-transform group-open/done:rotate-90" />
              Done in the last 2 weeks
              <span className="font-normal tabular-nums">{done.length}</span>
            </summary>
            <div className="grid gap-px border-t p-1">
              {done.map((t) => (
                <TaskItem key={t.id} task={t} people={people} showAssignee={showAssignee} />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
