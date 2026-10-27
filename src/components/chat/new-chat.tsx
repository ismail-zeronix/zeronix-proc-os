"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Hash, Lock } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createGroup, joinGroup, startDm } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import { chatKeys, isOn, useOpenGroups, type Presence, type Teammate } from "./chat-data";
import { useChatStore } from "./chat-store";
import { PanelHeader, PresenceAvatar, STATUS_LABEL } from "./panel-bits";

const inputClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Searchable list of teammates (people who are on first), single pick or several. */
export function PeopleList({
  teammates,
  presence,
  picked,
  onPick,
  disabled,
  exclude = [],
}: {
  teammates: Teammate[];
  presence: Presence;
  /** When set, the list is a multi-select with ticks. */
  picked?: Set<number>;
  onPick: (id: number) => void;
  disabled?: boolean;
  exclude?: number[];
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = teammates.filter((u) => !exclude.includes(u.id) && (!needle || u.name.toLowerCase().includes(needle) || u.jobTitle.toLowerCase().includes(needle)));
    return [...list].sort((a, b) => Number(isOn(presence, b.id)) - Number(isOn(presence, a.id)));
  }, [q, teammates, presence, exclude]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className={inputClass} />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-busy={disabled}>
        {!shown.length && <li className="py-6 text-center text-xs text-muted-foreground">{q ? `Nobody matches “${q}”.` : "Nobody else to add."}</li>}
        {shown.map((u) => {
          const on = picked?.has(u.id);
          return (
            <li key={u.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(u.id)}
                aria-pressed={picked ? on : undefined}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:opacity-60"
              >
                <PresenceAvatar name={u.name} status={presence[u.id]} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  {u.jobTitle && <p className="truncate text-xs text-muted-foreground">{u.jobTitle}</p>}
                </div>
                {picked ? (
                  <span className={`flex size-4.5 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>{on && <Check className="size-3" />}</span>
                ) : (
                  isOn(presence, u.id) && <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[presence[u.id]]}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Start a direct message, make a channel, or join a public one. */
export function NewChat({ teammates, presence, loadingPeople }: { teammates: Teammate[]; presence: Presence; loadingPeople: boolean }) {
  const qc = useQueryClient();
  const show = useChatStore((s) => s.show);
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const groups = useOpenGroups();

  const go = (fn: () => Promise<number>) =>
    start(async () => {
      try {
        const id = await fn();
        await qc.invalidateQueries({ queryKey: chatKeys.channels });
        show({ kind: "channel", id });
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <>
      <PanelHeader title="New" onBack={() => show({ kind: "list" })}>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs" role="tablist">
          {(
            [
              ["dm", "Direct"],
              ["group", "Channel"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`rounded-md px-2.5 py-1 ${mode === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </PanelHeader>

      {mode === "dm" ? (
        loadingPeople ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : (
          <PeopleList teammates={teammates} presence={presence} disabled={pending} onPick={(id) => go(() => startDm(id))} />
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <form
            className="grid gap-2 border-b p-2"
            onSubmit={(e) => {
              e.preventDefault();
              go(() => createGroup({ name, isPrivate, memberIds: [...picked] }));
            }}
          >
            <div className="flex gap-1.5">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Channel name, e.g. sales-team" aria-label="Channel name" className={inputClass} />
              <Button type="submit" size="sm" pending={pending} disabled={!name.trim()}>
                Create
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} className="accent-primary" />
              <Lock className="size-3" /> Private: only the people you add can see it
            </label>
            {picked.size > 0 && <p className="text-xs text-muted-foreground">{picked.size} selected</p>}
          </form>
          {groups.data && groups.data.length > 0 && (
            <div className="border-b">
              <p className="px-3 pt-2 text-[11px] font-medium text-muted-foreground uppercase">Channels you can join</p>
              <ul className="max-h-32 overflow-y-auto py-1">
                {groups.data.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 px-3 py-1">
                    <Hash className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{g.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{g.topic || `${g.members} ${g.members === 1 ? "person" : "people"}`}</p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        go(async () => {
                          await joinGroup(g.id);
                          void qc.invalidateQueries({ queryKey: chatKeys.groups });
                          return g.id;
                        })
                      }
                    >
                      Join
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="px-3 pt-2 text-[11px] font-medium text-muted-foreground uppercase">Add people</p>
          <PeopleList
            teammates={teammates}
            presence={presence}
            picked={picked}
            disabled={pending}
            onPick={(id) =>
              setPicked((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
          />
        </div>
      )}
    </>
  );
}
