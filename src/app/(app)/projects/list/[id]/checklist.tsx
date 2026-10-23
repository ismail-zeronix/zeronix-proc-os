"use client";

import { ArrowDown, ArrowUp, Ellipsis, ListPlus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { UserAvatar } from "@/components/user-avatar";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { CHECKLIST_GROUPS } from "@/lib/projects";
import type { ChecklistTask } from "@/lib/projects-data";
import { addChecklistTask, addTypeChecklist, deleteChecklistTask, moveChecklistTask, setChecklistDone, updateChecklistTask } from "../../checklist-actions";

type Person = { id: number; name: string };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        after?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

function Row({ task, people, first, last }: { task: ChecklistTask; people: Person[]; first: boolean; last: boolean }) {
  const [title, setTitle] = useState(task.title);
  const [pending, run] = useRun();
  const done = task.status === "done";
  const today = dubaiToday();
  const overdue = !done && !!task.dueDate && task.dueDate < today;
  // the assignee may have left the team; still show them in the list so the select is not blank
  const options = people.some((p) => p.id === task.assignedTo) ? people : [{ id: task.assignedTo, name: task.assigneeName }, ...people];

  return (
    <li className={`group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-md px-2 py-1 hover:bg-muted/50 sm:grid-cols-[auto_minmax(0,1fr)_auto_8.5rem_9rem_auto] ${pending ? "opacity-60" : ""}`}>
      <Checkbox
        checked={done}
        disabled={pending}
        aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} as done`}
        onCheckedChange={(v) => run(() => setChecklistDone(task.id, !!v))}
      />
      <Input
        aria-label="Task"
        className={`h-7 border-transparent bg-transparent px-1.5 text-sm shadow-none hover:border-input focus-visible:border-input ${done ? "text-muted-foreground line-through" : ""}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title !== task.title) run(() => updateChecklistTask(task.id, { title }));
          else if (!title.trim()) setTitle(task.title);
        }}
      />
      <div className="col-span-2 flex items-center gap-1.5 pl-6 sm:col-span-1 sm:contents sm:pl-0">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={task.required}
          className={task.required ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}
          aria-label={task.required ? "Required before the project is completed: click to make it optional" : "Make this required before the project is completed"}
          title={task.required ? "Required before the project can be completed" : "Not required for completion"}
          onClick={() => run(() => updateChecklistTask(task.id, { required: !task.required }))}
        >
          <ShieldCheck />
        </Button>
        <label className={`relative flex h-7 shrink-0 items-center rounded-md border px-2 text-xs ${overdue ? "border-destructive/40 font-medium text-destructive" : "text-muted-foreground"}`}>
          <span className="pointer-events-none truncate">{task.dueDate ? `${overdue ? "Overdue · " : ""}${dayLabel(task.dueDate, today)}` : "No date"}</span>
          <input
            type="date"
            aria-label="Due date"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={task.dueDate ?? ""}
            onChange={(e) => run(() => updateChecklistTask(task.id, { dueDate: e.target.value }))}
          />
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <UserAvatar name={task.assigneeName} size={20} className="hidden sm:block" />
          <NativeSelect size="sm" className="w-full" aria-label="Assigned to" value={task.assignedTo} onChange={(e) => run(() => updateChecklistTask(task.id, { assignedTo: Number(e.target.value) }))}>
            {options.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`More for ${task.title}`} title="More" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem disabled={first} onClick={() => run(() => moveChecklistTask(task.id, "up"))}>
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onClick={() => run(() => moveChecklistTask(task.id, "down"))}>
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => confirm(`Remove "${task.title}" from the checklist?`) && run(() => deleteChecklistTask(task.id), "Task removed")}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function AddRow({ projectId, group }: { projectId: number; group: string }) {
  const [title, setTitle] = useState("");
  const [pending, run] = useRun();
  const add = () => title.trim() && run(() => addChecklistTask(projectId, { group, title }), undefined, () => setTitle(""));
  return (
    <li className="flex items-center gap-2.5 px-2 py-1">
      <Plus className="size-4 shrink-0 text-muted-foreground" />
      <Input
        aria-label="Add a task"
        placeholder="Add a task"
        className="h-7 border-transparent bg-transparent px-1.5 text-sm shadow-none hover:border-input focus-visible:border-input"
        value={title}
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
    </li>
  );
}

export function Checklist({ projectId, tasks, people, typeLabel }: { projectId: number; tasks: ChecklistTask[]; people: Person[]; typeLabel: string }) {
  const [pending, run] = useRun();
  const done = tasks.filter((t) => t.status === "done").length;
  const requiredOpen = tasks.filter((t) => t.required && t.status === "open").length;
  const addFromType = () =>
    run(async () => {
      const n = await addTypeChecklist(projectId);
      toast.success(n ? `Added ${n} task${n === 1 ? "" : "s"} from the ${typeLabel} checklist` : `Every ${typeLabel} task is already here`);
    });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {tasks.length ? (
            <>
              <span className="font-medium text-foreground">
                {done} of {tasks.length} done
              </span>
              {requiredOpen > 0 && ` · ${requiredOpen} required still open`} · <ShieldCheck className="inline size-3.5 text-primary" /> = needed before the project can be completed.
              Work and handover dates follow the start date.
            </>
          ) : (
            `No checklist yet. Start from the ${typeLabel} checklist, or add your own tasks below.`
          )}
        </p>
        <Button variant={tasks.length ? "ghost" : "default"} size="sm" pending={pending} onClick={addFromType} title={`Add the ${typeLabel} tasks this project does not have yet`}>
          <ListPlus /> {tasks.length ? `Add missing ${typeLabel} tasks` : `Add the ${typeLabel} checklist`}
        </Button>
      </div>

      {CHECKLIST_GROUPS.map((g) => {
        const list = tasks.filter((t) => t.group === g.key).sort((a, b) => a.position - b.position || a.id - b.id);
        const n = list.filter((t) => t.status === "done").length;
        return (
          <section key={g.key} aria-label={g.label} className="rounded-lg border">
            <header className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
              <h3 className="text-sm font-semibold">{g.label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {n}/{list.length}
                {g.from === "start" && " · dates from the start date"}
              </span>
            </header>
            <ul className="grid py-1">
              {list.map((t, i) => (
                <Row key={`${t.id}-${t.title}`} task={t} people={people} first={i === 0} last={i === list.length - 1} />
              ))}
              <AddRow projectId={projectId} group={g.key} />
            </ul>
          </section>
        );
      })}
    </div>
  );
}
