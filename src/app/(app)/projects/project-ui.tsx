"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUSES } from "@/lib/projects";
import { setProjectStatus, updateProjectDetails } from "./actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

/**
 * Work status of a won project (lists and the project page). "Completed" is refused while required checklist tasks are
 * open; the menu then names them, and an admin may complete it anyway (written to the timeline).
 */
export function ProjectStatusMenu({ projectId, status, size = "sm", canOverride = false }: { projectId: number; status: string; size?: "sm" | "default"; canOverride?: boolean }) {
  const [pending, run] = useRun();
  const move = (to: string) =>
    run(async () => {
      const r = await setProjectStatus(projectId, to);
      if (!r.openRequired) return void toast.success("Status updated");
      const list = r.openRequired.slice(0, 6).join("\n- ");
      const more = r.openRequired.length > 6 ? `\n…and ${r.openRequired.length - 6} more` : "";
      const n = r.openRequired.length;
      if (canOverride && confirm(`${n} required task${n === 1 ? " is" : "s are"} still open:\n- ${list}${more}\n\nMark the project completed anyway?`)) {
        await setProjectStatus(projectId, to, true);
        toast.success("Status updated");
      } else if (!canOverride) {
        toast.error(`Finish the required tasks first: ${r.openRequired.slice(0, 3).join(", ")}${r.openRequired.length > 3 ? ` and ${r.openRequired.length - 3} more` : ""}.`);
      }
    });
  return (
    <NativeSelect
      size={size}
      aria-label="Work status"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const to = e.target.value;
        if (to === "cancelled" && !confirm("Cancel this project? The deal stays won; cancel its order separately if needed.")) return;
        move(to);
      }}
    >
      {PROJECT_STATUSES.map((s) => (
        <NativeSelectOption key={s.key} value={s.key} title={s.hint}>
          {s.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** The project-type filter of the list; kept in the address like the other filters. */
export function TypeFilter({ types, value }: { types: { key: string; label: string }[]; value: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <NativeSelect
      size="sm"
      aria-label="Project type"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        if (e.target.value) p.set("type", e.target.value);
        else p.delete("type");
        router.replace(p.size ? `?${p}` : "?");
      }}
    >
      <NativeSelectOption value="">All types</NativeSelectOption>
      {types.map((t) => (
        <NativeSelectOption key={t.key} value={t.key}>
          {t.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** A thin done / total bar for the task checklist. */
export function TaskProgress({ done, open }: { done: number; open: number }) {
  const total = done + open;
  if (!total) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <span className="inline-flex items-center gap-2" title={`${done} of ${total} tasks done`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${(done / total) * 100}%`, background: "var(--series-1)" }} />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}

export function ProjectDetailsForm({
  project,
  people,
}: {
  project: { id: number; siteAddress: string; siteMapUrl: string; startDate: string | null; targetDate: string | null; notes: string; managerId: number | null };
  people: { id: number; name: string }[];
}) {
  const [f, setF] = useState({
    siteAddress: project.siteAddress,
    siteMapUrl: project.siteMapUrl,
    startDate: project.startDate ?? "",
    targetDate: project.targetDate ?? "",
    notes: project.notes,
    managerId: project.managerId ?? 0,
  });
  const [pending, run] = useRun();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateProjectDetails(project.id, { ...f, managerId: Number(f.managerId) || null }), "Project saved");
      }}
    >
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="p-site">Site address</Label>
        <Textarea id="p-site" rows={2} value={f.siteAddress} onChange={set("siteAddress")} placeholder="Building, floor, area, emirate" />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="p-map">Map link</Label>
        <Input id="p-map" type="url" value={f.siteMapUrl} onChange={set("siteMapUrl")} placeholder="https://maps.app.goo.gl/…" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-start">Start date</Label>
        <Input id="p-start" type="date" value={f.startDate} onChange={set("startDate")} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-target">Target completion</Label>
        <Input id="p-target" type="date" value={f.targetDate} onChange={set("targetDate")} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-manager">Project manager</Label>
        <NativeSelect className="w-full" id="p-manager" value={f.managerId} onChange={set("managerId")}>
          <NativeSelectOption value={0}>Nobody yet</NativeSelectOption>
          {people.map((u) => (
            <NativeSelectOption key={u.id} value={u.id}>
              {u.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="p-notes">Site notes</Label>
        <Textarea id="p-notes" rows={4} value={f.notes} onChange={set("notes")} placeholder="Access times, parking, security pass, who to call on site…" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" pending={pending}>
          Save project
        </Button>
      </div>
    </form>
  );
}
