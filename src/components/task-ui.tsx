"use client";

import { FolderKanban, Handshake, Pencil, Plus, Trash2 } from "lucide-react";
import { AppLink } from "@/components/app-link";
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
import { UserAvatar } from "@/components/user-avatar";
import { MentionText } from "@/components/mention-text";
import { MentionTextarea, useMentionPeople, useMentions } from "@/components/mention-textarea";
import { tokensToText } from "@/lib/chat/text";
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
  const mentions = useMentions(`task:${task?.id ?? "new"}`);
  const team = useMentionPeople(undefined);

  const save = () =>
    start(async () => {
      try {
        const notes = mentions.toTokens(f.notes);
        if (task) await updateTask(task.id, { ...f, notes });
        else await createTask({ ...f, notes, related });
        mentions.reset();
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
        if (o) {
          const start = from(task);
          setF({ ...start, notes: mentions.load(start.notes) });
        }
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
            <MentionTextarea
              id="task-notes"
              mentions={mentions}
              people={team.people}
              placement="below"
              value={f.notes}
              onChange={(notes) => setF({ ...f, notes })}
              placeholder="@ to mention a teammate"
              className="field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
          </div>
          <Button type="submit" pending={pending} disabled={!f.title.trim()}>
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
    <div className={`group flex min-w-0 items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60 ${pending ? "opacity-60" : ""}`}>
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={pending}
        aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} as done`}
        onCheckedChange={(v) => run(() => setTaskDone(task.id, !!v), v ? "Task done" : undefined)}
      />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium break-words ${done ? "text-muted-foreground line-through" : ""}`}>{task.title}</div>
        {!compact && task.notes && (
          <div className="line-clamp-1 text-xs text-muted-foreground" title={tokensToText(task.notes)}>
            <MentionText body={task.notes} />
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {task.dueDate && (
            <span className={overdue ? "font-medium text-destructive" : ""}>
              {overdue ? "Overdue · " : ""}
              {dayLabel(task.dueDate, today)}
            </span>
          )}
          {task.priority === "high" && !done && <Badge variant="destructive">High</Badge>}
          {!hideRelated && task.relatedType === "deal" && task.relatedId && task.relatedTitle && (
            <AppLink href={`/crm/deals/${task.relatedId}`} className="flex min-w-0 max-w-full items-center gap-1 hover:text-foreground hover:underline">
              <Handshake className="size-3 shrink-0" /> <span className="truncate">{task.relatedTitle}</span>
            </AppLink>
          )}
          {!hideRelated && task.relatedType === "project" && task.relatedId && task.relatedTitle && (
            <AppLink href={`/projects/list/${task.relatedId}?tab=tasks`} className="flex min-w-0 max-w-full items-center gap-1 hover:text-foreground hover:underline">
              <FolderKanban className="size-3 shrink-0" /> <span className="truncate">{task.relatedTitle}</span>
            </AppLink>
          )}
        </div>
      </div>
      {showAssignee && <UserAvatar name={task.assigneeName} size={22} className="mt-px" />}
      {!compact && (
        <div className="flex shrink-0 gap-0.5 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <TaskDialog
            task={task}
            people={people}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit task" title="Edit">
                <Pencil />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete task"
            title="Delete"
            pending={pending}
            onClick={() => confirm(`Delete "${task.title}"?`) && run(() => deleteTask(task.id), "Task deleted")}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
}
