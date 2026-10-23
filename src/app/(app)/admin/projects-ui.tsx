"use client";

import { ArrowDown, ArrowUp, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHECKLIST_GROUPS } from "@/lib/projects";
import { addProjectType, addTemplate, deleteTemplate, moveTemplate, saveProjectType, updateTemplate } from "./project-type-actions";

interface TypeRow {
  key: string;
  label: string;
  isActive: boolean;
  defaultSections: string[];
}
interface TemplateRow {
  id: number;
  typeKey: string;
  checklistGroup: string;
  title: string;
  offsetDays: number | null;
  required: boolean;
  position: number;
}

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

function TemplateLine({ t, first, last }: { t: TemplateRow; first: boolean; last: boolean }) {
  const [title, setTitle] = useState(t.title);
  const [offset, setOffset] = useState(t.offsetDays == null ? "" : String(t.offsetDays));
  const [pending, run] = useRun();
  const save = (required = t.required) => {
    const o = offset.trim() === "" ? null : Number(offset);
    if (o != null && (!Number.isInteger(o) || o < 0)) return void toast.error("Days must be a whole number, 0 or more.");
    if (!title.trim()) return void setTitle(t.title);
    if (title === t.title && o === t.offsetDays && required === t.required) return;
    run(() => updateTemplate(t.id, { title, offsetDays: o, required }));
  };
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_5rem_auto_auto] items-center gap-1.5 px-2 py-1 ${pending ? "opacity-60" : ""}`}>
      <Input aria-label="Task" className="h-7 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => save()} />
      <Input
        aria-label="Due after (days)"
        title="Due this many days after the project is opened (survey) or started (work, handover). Empty = no date."
        inputMode="numeric"
        placeholder="days"
        className="h-7 text-right text-sm tabular-nums"
        value={offset}
        onChange={(e) => setOffset(e.target.value)}
        onBlur={() => save()}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={t.required}
        className={t.required ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}
        aria-label={t.required ? "Required for completion: click to make it optional" : "Make it required for completion"}
        title={t.required ? "Required before a project can be completed" : "Not required for completion"}
        onClick={() => save(!t.required)}
      >
        <ShieldCheck />
      </Button>
      <span className="flex">
        <Button variant="ghost" size="icon-sm" disabled={first} aria-label="Move up" title="Move up" onClick={() => run(() => moveTemplate(t.id, "up"))}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={last} aria-label="Move down" title="Move down" onClick={() => run(() => moveTemplate(t.id, "down"))}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label="Remove" title="Remove" onClick={() => run(() => deleteTemplate(t.id))}>
          <Trash2 />
        </Button>
      </span>
    </li>
  );
}

function AddTemplate({ typeKey, group }: { typeKey: string; group: string }) {
  const [title, setTitle] = useState("");
  const [pending, run] = useRun();
  return (
    <li className="flex items-center gap-1.5 px-2 py-1">
      <Plus className="size-4 shrink-0 text-muted-foreground" />
      <Input
        aria-label="Add a task"
        placeholder="Add a task"
        className="h-7 text-sm"
        value={title}
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            e.preventDefault();
            run(() => addTemplate(typeKey, group, title), undefined, () => setTitle(""));
          }
        }}
      />
    </li>
  );
}

function TypeEditor({ type, templates }: { type: TypeRow; templates: TemplateRow[] }) {
  const [name, setName] = useState(type.label);
  const [active, setActive] = useState(type.isActive);
  const [sections, setSections] = useState(type.defaultSections.join("\n"));
  const [pending, run] = useRun();
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveProjectType(type.key, { label: name, isActive: active, defaultSections: sections.split("\n") }), "Project type saved");
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pt-name">Name</Label>
          <Input id="pt-name" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="mt-1 flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} /> Offered for new projects
          </label>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pt-sections">BOQ sections a new project starts with</Label>
          <Textarea id="pt-sections" rows={5} value={sections} onChange={(e) => setSections(e.target.value)} placeholder="One per line" />
          <p className="text-xs text-muted-foreground">One per line. Each project can still rename, add or remove sections.</p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" pending={pending} disabled={!name.trim()}>
            Save type
          </Button>
        </div>
      </form>

      <div className="grid gap-2">
        <div>
          <h3 className="text-sm font-medium">Starting checklist</h3>
          <p className="text-xs text-muted-foreground">
            Copied into every new {type.label} project. Days: survey tasks count from the day the project is opened, work and handover tasks from its start date.{" "}
            <ShieldCheck className="inline size-3.5 text-primary" /> = must be done before the project can be marked completed.
          </p>
        </div>
        {CHECKLIST_GROUPS.map((g) => {
          const list = templates.filter((t) => t.checklistGroup === g.key).sort((a, b) => a.position - b.position || a.id - b.id);
          return (
            <section key={g.key} className="rounded-lg border">
              <header className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
                <h4 className="text-sm font-semibold">{g.label}</h4>
                <span className="text-xs text-muted-foreground">days from {g.from === "opened" ? "opening" : "the start date"}</span>
              </header>
              <ul className="grid py-1">
                {list.map((t, i) => (
                  <TemplateLine key={`${t.id}-${t.title}-${t.offsetDays}-${t.required}`} t={t} first={i === 0} last={i === list.length - 1} />
                ))}
                <AddTemplate typeKey={type.key} group={g.key} />
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Admin > Settings > Projects: the project types with their default BOQ sections and starting checklist. */
export function ProjectTypeSettings({ types, templates }: { types: TypeRow[]; templates: TemplateRow[] }) {
  const [picked, setPicked] = useState(types[0]?.key ?? "");
  const [newName, setNewName] = useState("");
  const [pending, run] = useRun();
  const type = types.find((t) => t.key === picked) ?? types[0];

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="grid content-start gap-2">
        <h2 className="text-sm font-medium">Project types</h2>
        <ul className="grid gap-0.5">
          {types.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => setPicked(t.key)}
                aria-current={t.key === type?.key ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${t.key === type?.key ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
              >
                <span className={t.isActive ? "" : "text-muted-foreground line-through"}>{t.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{templates.filter((x) => x.typeKey === t.key).length}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => setPicked(await addProjectType(newName)),
              "Project type added",
              () => setNewName(""),
            );
          }}
        >
          <Input aria-label="New project type" placeholder="New type, e.g. Solar" className="h-8 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button type="submit" size="icon-sm" pending={pending} disabled={newName.trim().length < 2} aria-label="Add project type" title="Add project type">
            <Plus />
          </Button>
        </form>
      </div>
      {type ? <TypeEditor key={type.key} type={type} templates={templates.filter((t) => t.typeKey === type.key)} /> : <p className="text-sm text-muted-foreground">No project types yet.</p>}
    </div>
  );
}
