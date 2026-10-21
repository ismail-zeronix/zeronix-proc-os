"use client";

import { Handshake, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask, deleteTask, setTaskDone, updateTask } from "@/app/(app)/tasks/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dayLabel, dubaiToday } from "@/lib/dates";
import type { TaskRow } from "@/lib/tasks";

type Person = { id: number; name: string };

/** Add a task, or edit one when `task` is given. Only admins get the "Assign to" list (pass `people`). */
export function TaskDialog({
  task,
  people,
  trigger,
  related,
}: {
  task?: TaskRow;
  people?: Person[];
  trigger: React.ReactElement;
  /** New tasks created from here belong to this deal. */
  related?: { type: "deal"; id: number };
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const blank = { title: "", notes: "", dueDate: "", priority: "normal" as "normal" | "high", assignedTo: undefined as number | undefined };
  const from = (t?: TaskRow) =>
    t ? { title: t.title, notes: t.notes, dueDate: t.dueDate ?? "", priority: t.priority, assignedTo: t.assignedTo } : blank;
  const [f, setF] = useState(from(task));

  const save = () =>
    start(async () => {
      try {
        if (task) await updateTask(task.id, f);
        else await createTask({ ...f, related });
        toast.success(task ? "Task updated" : "Task added");
        setOpen(false);
        if (!task) setF(blank);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(from(task));
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>{task ? "Change what, when or who." : "What needs doing, and by when?"}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Task</Label>
            <Input id="task-title" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Call ABC Trading about the quote" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-prio">Priority</Label>
              <NativeSelect id="task-prio" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as "normal" | "high" })}>
                <NativeSelectOption value="normal">Normal</NativeSelectOption>
                <NativeSelectOption value="high">High</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          {people && (
            <div className="grid gap-1.5">
              <Label htmlFor="task-who">Assign to</Label>
              <NativeSelect
                id="task-who"
                value={f.assignedTo ?? ""}
                onChange={(e) => setF({ ...f, assignedTo: e.target.value ? Number(e.target.value) : undefined })}
              >
                <NativeSelectOption value="">Me</NativeSelectOption>
                {people.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="task-notes">Notes (optional)</Label>
            <Textarea id="task-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          <Button type="submit" disabled={pending || !f.title.trim()}>
            {task ? "Save" : "Add task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Header shortcut: add a task for yourself from any page. */
export function QuickAddTask() {
  return (
    <TaskDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label="Add task">
          <Plus />
          <span className="hidden sm:inline">Task</span>
        </Button>
      }
    />
  );
}

/** One task line: tick to finish, due label, and (unless `compact`) edit and delete. */
export function TaskItem({
  task,
  people,
  showAssignee,
  compact,
  hideRelated,
}: {
  task: TaskRow;
  people?: Person[];
  showAssignee?: boolean;
  compact?: boolean;
  /** Do not show the deal link (used on the deal's own page). */
  hideRelated?: boolean;
}) {
  const [pending, start] = useTransition();
  const done = task.status === "done";
  const today = dubaiToday();
  const overdue = !done && !!task.dueDate && task.dueDate < today;
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <div className={`flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted ${pending ? "opacity-60" : ""}`}>
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={pending}
        aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} as done`}
        onCheckedChange={(v) => run(() => setTaskDone(task.id, !!v), v ? "Task done" : undefined)}
      />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{task.title}</div>
        {!compact && task.notes && <div className="text-xs whitespace-pre-line text-muted-foreground">{task.notes}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {task.dueDate && (
            <span className={overdue ? "font-medium text-destructive" : ""}>
              {overdue ? "Overdue · " : ""}
              {dayLabel(task.dueDate, today)}
            </span>
          )}
          {task.priority === "high" && !done && <Badge variant="destructive">High</Badge>}
          {showAssignee && <span>· {task.assigneeName}</span>}
          {!hideRelated && task.relatedType === "deal" && task.relatedId && task.relatedTitle && (
            <Link href={`/sales/deals/${task.relatedId}`} className="inline-flex max-w-full items-center gap-1 truncate hover:text-foreground hover:underline">
              <Handshake className="size-3 shrink-0" /> {task.relatedTitle}
            </Link>
          )}
        </div>
      </div>
      {!compact && (
        <div className="flex shrink-0 gap-0.5">
          <TaskDialog
            task={task}
            people={people}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit task">
                <Pencil />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete task"
            disabled={pending}
            onClick={() => confirm(`Delete "${task.title}"?`) && run(() => deleteTask(task.id), "Task deleted")}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
}
