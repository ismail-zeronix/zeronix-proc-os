"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Archive, Crown, LogOut, UserMinus, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addMembers, leaveGroup, removeFromGroup, updateGroup } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import type { ChannelSummary } from "@/lib/chat/types";
import { chatKeys, type Presence, type Teammate } from "./chat-data";
import { useChatStore } from "./chat-store";
import { PanelHeader, PresenceAvatar } from "./panel-bits";
import type { Me } from "./message-row";
import { PeopleList } from "./new-chat";

const inputClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

/** A channel's details: name, topic, private or public, who is in it; the owner (or an admin) can change them. */
export function ChannelInfo({ channel, me, presence, teammates }: { channel: ChannelSummary; me: Me; presence: Presence; teammates: Teammate[] }) {
  const qc = useQueryClient();
  const show = useChatStore((s) => s.show);
  const [pending, start] = useTransition();
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic);
  const [adding, setAdding] = useState(false);
  const canManage = channel.role === "owner" || me.isAdmin;
  const canAdd = canManage || !channel.isPrivate;

  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        await qc.invalidateQueries({ queryKey: chatKeys.channels });
        if (ok) toast.success(ok);
        after?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  if (adding) {
    return (
      <>
        <PanelHeader title={`Add people to #${channel.name}`} onBack={() => setAdding(false)} />
        <PeopleList
          teammates={teammates}
          presence={presence}
          exclude={channel.members.map((m) => m.id)}
          disabled={pending}
          onPick={(id) => run(() => addMembers(channel.id, [id]), "Added")}
        />
      </>
    );
  }

  return (
    <>
      <PanelHeader title="Channel details" onBack={() => show({ kind: "channel", id: channel.id })} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <form
          className="grid gap-2 border-b p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateGroup(channel.id, { name, topic }), "Saved");
          }}
        >
          <label className="grid gap-1 text-xs text-muted-foreground">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!canManage} className={inputClass} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Topic
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} disabled={!canManage} placeholder="What this channel is for" className={inputClass} />
          </label>
          {canManage && (
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={channel.isPrivate}
                  disabled={pending}
                  onChange={(e) => run(() => updateGroup(channel.id, { isPrivate: e.target.checked }), e.target.checked ? "Now private" : "Now public")}
                  className="accent-primary"
                />
                Private
              </label>
              <Button type="submit" size="xs" pending={pending} disabled={!name.trim() || (name === channel.name && topic === channel.topic)}>
                Save
              </Button>
            </div>
          )}
        </form>

        <div className="flex items-center justify-between px-3 pt-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase">{channel.members.length} people</p>
          {canAdd && (
            <Button size="xs" variant="ghost" onClick={() => setAdding(true)}>
              <UserPlus /> Add
            </Button>
          )}
        </div>
        <ul className="py-1">
          {channel.members.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5 px-3 py-1">
              <PresenceAvatar name={u.name} status={presence[u.id]} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {u.name}
                {u.id === me.id && <span className="text-muted-foreground"> (you)</span>}
              </span>
              {u.role === "owner" && <Crown className="size-3.5 text-amber-500" aria-label="Owner" />}
              {canManage && u.id !== me.id && (
                <Button size="icon-xs" variant="ghost" aria-label={`Remove ${u.name}`} title="Remove" disabled={pending} onClick={() => run(() => removeFromGroup(channel.id, u.id), `${u.name} removed`)}>
                  <UserMinus />
                </Button>
              )}
            </li>
          ))}
        </ul>

        <div className="grid gap-1 border-t p-3">
          <Button variant="ghost" size="sm" className="justify-start" disabled={pending} onClick={() => run(() => leaveGroup(channel.id), "You left the channel", () => show({ kind: "list" }))}>
            <LogOut /> Leave channel
          </Button>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-destructive"
              disabled={pending}
              onClick={() => run(() => updateGroup(channel.id, { archived: true }), "Channel archived", () => show({ kind: "list" }))}
            >
              <Archive /> Archive channel
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
