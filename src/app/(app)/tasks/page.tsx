import { asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/stat-tile";
import { TaskDialog, TaskItem } from "@/components/task-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { groupOpen, listTasks, type TaskRow } from "@/lib/tasks";

export const metadata = { title: "Tasks · Zeronix" };

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

  const sections: { title: string; tasks: TaskRow[]; tone?: "bad" }[] = [
    { title: "Overdue", tasks: g.overdue, tone: "bad" },
    { title: "Today", tasks: g.today },
    { title: "Upcoming", tasks: g.upcoming },
    { title: "No date", tasks: g.undated },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={viewAll ? "All tasks" : viewId ? `Tasks: ${people?.find((p) => p.id === viewId)?.name ?? "user"}` : "My tasks"}
        description={`${open.length} open`}
        actions={
          <TaskDialog
            people={people}
            trigger={
              <Button>
                <Plus /> New task
              </Button>
            }
          />
        }
      />

      {isAdmin && (
        <div className="flex flex-wrap gap-1.5 text-sm">
          <Chip href="/tasks" active={!viewAll && !viewId}>
            Mine
          </Chip>
          <Chip href="/tasks?who=all" active={viewAll}>
            Everyone
          </Chip>
          {people
            ?.filter((p) => p.id !== user.id)
            .map((p) => (
              <Chip key={p.id} href={`/tasks?who=${p.id}`} active={viewId === p.id}>
                {p.name}
              </Chip>
            ))}
        </div>
      )}

      {open.length === 0 && (
        <Card>
          <CardContent>
            <Empty>Nothing open. Add a task, or enjoy the quiet.</Empty>
          </CardContent>
        </Card>
      )}

      {sections.map(
        (s) =>
          s.tasks.length > 0 && (
            <Card key={s.title}>
              <CardHeader>
                <CardTitle className={`text-base ${s.tone === "bad" ? "text-destructive" : ""}`}>
                  {s.title} <span className="font-normal text-muted-foreground">({s.tasks.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-0.5">
                {s.tasks.map((t) => (
                  <TaskItem key={t.id} task={t} people={people} showAssignee={showAssignee} />
                ))}
              </CardContent>
            </Card>
          ),
      )}

      {done.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Done in the last 2 weeks</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-0.5">
            {done.map((t) => (
              <TaskItem key={t.id} task={t} people={people} showAssignee={showAssignee} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 ${active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
    >
      {children}
    </Link>
  );
}
