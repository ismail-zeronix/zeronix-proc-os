"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Pencil, Reply, SmilePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteMessage, editMessage, toggleReaction } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AvatarStack, UserAvatar } from "@/components/user-avatar";
import { MentionText } from "@/components/mention-text";
import { EVENT_LABEL, MAX_BODY, parseRecordRefs, tokensToText } from "@/lib/chat/text";
import type { ChatMessage, ChatUser } from "@/lib/chat/types";
import { dayLabel, dubaiToday, TZ } from "@/lib/dates";
import { replaceMessage, setReactions } from "./chat-data";
import { RecordCard } from "./record-card";

/** Messages from the same person within this long sit together under one name. */
const GROUP_MS = 5 * 60_000;

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "✅", "🙏", "👀", "🎉", "🔥"];

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export interface Me {
  id: number;
  name: string;
  isAdmin: boolean;
}

/** Message text: mentions as chips, records as #labels, web links clickable. */
export function MessageText({ body, me, inverse }: { body: string; me?: number; inverse?: boolean }) {
  return <MentionText body={body} me={me} inverse={inverse} />;
}

export interface RowActions {
  onReply?: (m: ChatMessage) => void;
  onThread?: (m: ChatMessage) => void;
}

export function MessageRow({
  m,
  prev,
  me,
  names,
  seen,
  readers,
  actions,
}: {
  m: ChatMessage;
  prev?: ChatMessage;
  me: Me;
  /** user id → name, for who reacted */
  names: Map<number, string>;
  /** DM: the other person has read up to here */
  seen?: boolean;
  /** Group: these people have read up to here */
  readers?: ChatUser[];
  actions: RowActions;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const day = dubaiToday(new Date(m.createdAt));
  const newDay = !prev || dubaiToday(new Date(prev.createdAt)) !== day;
  const grouped =
    !newDay && !!prev && prev.userId === m.userId && prev.kind !== "system" && !m.replyTo && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
  const mine = m.userId === me.id;
  const deleted = !!m.deletedAt;

  const react = async (emoji: string) => {
    try {
      setReactions(qc, m.channelId, m.threadId, m.id, await toggleReaction(m.id, emoji));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      {newDay && (
        <div className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {dayLabel(day)}
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
      {m.kind === "system" ? (
        <p className="my-1 text-center text-[11px] text-muted-foreground">
          <MessageText body={m.body} /> · {timeOf(m.createdAt)}
        </p>
      ) : m.kind === "card" && m.card && !deleted ? (
        <CardMessage m={m} me={me} />
      ) : (
        <div className={`group/msg flex gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-2"}`}>
          {!mine && (grouped ? <span className="w-6 shrink-0" /> : <UserAvatar name={m.userName ?? "?"} size={24} className="mt-0.5" />)}
          <div className={`flex max-w-[80%] min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
            {!grouped && (
              <span className="mb-0.5 text-[11px] text-muted-foreground">
                {!mine && <span className="mr-1 font-medium text-foreground">{m.userName ?? "Portal"}</span>}
                {timeOf(m.createdAt)}
              </span>
            )}
            {m.replyTo && (
              <div className={`mb-0.5 max-w-full truncate border-l-2 border-primary/50 pl-2 text-[11px] text-muted-foreground ${mine ? "text-right" : ""}`}>
                <span className="font-medium">{m.replyTo.userName ?? "Portal"}</span>: {m.replyTo.deleted ? <i>message deleted</i> : tokensToText(m.replyTo.body)}
              </div>
            )}
            <div className={`relative flex items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
              {editing ? (
                <EditBox m={m} onDone={() => setEditing(false)} />
              ) : (
                <div
                  title={grouped ? timeOf(m.createdAt) : undefined}
                  className={`min-w-0 rounded-2xl px-3 py-1.5 text-sm wrap-break-word whitespace-pre-wrap ${
                    deleted ? "border text-muted-foreground italic" : mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"
                  }`}
                >
                  {deleted ? "Message deleted" : <MessageText body={m.body} me={me.id} inverse={mine} />}
                  {m.editedAt && !deleted && <span className="ml-1 text-[10px] opacity-70">(edited)</span>}
                </div>
              )}
              {!deleted && !editing && (
                <Toolbar
                  m={m}
                  mine={mine}
                  canDelete={mine || me.isAdmin}
                  onReact={react}
                  onEdit={() => setEditing(true)}
                  onDelete={async () => {
                    try {
                      await deleteMessage(m.id);
                      replaceMessage(qc, { ...m, deletedAt: new Date().toISOString(), body: "", reactions: [] });
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                  actions={actions}
                />
              )}
            </div>
            {!deleted && m.kind === "text" && <LinkedCards body={m.body} from={m.userName} mine={mine} />}
            {m.reactions.length > 0 && (
              <div className={`mt-0.5 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
                {m.reactions.map((r) => {
                  const minePick = r.userIds.includes(me.id);
                  return (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => react(r.emoji)}
                      title={r.userIds.map((u) => (u === me.id ? "You" : (names.get(u) ?? "Someone"))).join(", ")}
                      aria-pressed={minePick}
                      className={`flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] ${minePick ? "border-primary/60 bg-primary/10" : "bg-background hover:bg-muted"}`}
                    >
                      <span>{r.emoji}</span>
                      <span className="tabular-nums">{r.userIds.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {m.replyCount > 0 && actions.onThread && (
              <button type="button" onClick={() => actions.onThread?.(m)} className="mt-0.5 text-[11px] font-medium text-primary hover:underline">
                {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
              </button>
            )}
            {seen && <span className="mt-0.5 text-[11px] text-muted-foreground">Seen</span>}
            {readers && readers.length > 0 && (
              <span className="mt-0.5" title={`Seen by ${readers.map((r) => r.name).join(", ")}`}>
                <AvatarStack users={readers} size={14} max={5} />
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Toolbar({
  m,
  mine,
  canDelete,
  onReact,
  onEdit,
  onDelete,
  actions,
}: {
  m: ChatMessage;
  mine: boolean;
  canDelete: boolean;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  actions: RowActions;
}) {
  const [open, setOpen] = useState<"react" | "delete" | null>(null);
  // stays visible while one of its popovers is open
  return (
    <div
      className={`flex shrink-0 items-center rounded-md border bg-popover shadow-sm transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100"}`}
    >
      <Popover open={open === "react"} onOpenChange={(o) => setOpen(o ? "react" : null)}>
        <PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label="React" title="React" />}>
          <SmilePlus />
        </PopoverTrigger>
        <PopoverContent className="flex w-auto gap-0.5 p-1" side="top">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className="rounded p-1 text-base hover:bg-muted"
              onClick={() => {
                setOpen(null);
                onReact(e);
              }}
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {actions.onReply && (
        <Button variant="ghost" size="icon-xs" aria-label="Reply" title="Reply" onClick={() => actions.onReply?.(m)}>
          <Reply />
        </Button>
      )}
      {actions.onThread && (
        <Button variant="ghost" size="icon-xs" aria-label="Reply in thread" title="Reply in thread" onClick={() => actions.onThread?.(m)}>
          <MessageSquareText />
        </Button>
      )}
      {mine && m.kind === "text" && (
        <Button variant="ghost" size="icon-xs" aria-label="Edit" title="Edit" onClick={onEdit}>
          <Pencil />
        </Button>
      )}
      {canDelete && (
        <Popover open={open === "delete"} onOpenChange={(o) => setOpen(o ? "delete" : null)}>
          <PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Delete" title="Delete" />}>
            <Trash2 />
          </PopoverTrigger>
          <PopoverContent className="grid w-52 gap-2 p-3 text-sm" side="top">
            <p>Delete this message for everyone?</p>
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button
                size="xs"
                variant="destructive"
                onClick={() => {
                  setOpen(null);
                  onDelete();
                }}
              >
                Delete
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function EditBox({ m, onDone }: { m: ChatMessage; onDone: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState(m.body);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const t = text.trim();
    if (!t || t === m.body) return onDone();
    setSaving(true);
    try {
      replaceMessage(qc, await editMessage(m.id, t));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  };
  return (
    <div className="grid w-64 max-w-full gap-1">
      <textarea
        autoFocus
        value={text}
        maxLength={MAX_BODY}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onDone();
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
        aria-label="Edit message"
        className="field-sizing-content max-h-40 min-h-9 resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <span className="text-[10px] text-muted-foreground">Enter to save · Esc to cancel</span>
    </div>
  );
}

/** Cards for the records a message links with "#" (up to three). */
function LinkedCards({ body, from, mine }: { body: string; from: string | null; mine: boolean }) {
  const refs = parseRecordRefs(body).slice(0, 3);
  if (!refs.length) return null;
  return (
    <div className={`mt-1 grid w-full gap-1 ${mine ? "justify-items-end" : ""}`}>
      {refs.map((r) => (
        <RecordCard key={r} cardRef={r} from={from} />
      ))}
    </div>
  );
}

/** A mention card in the Activity feed: who mentioned you and where, what they wrote, and the record live. */
function CardMessage({ m, me }: { m: ChatMessage; me: Me }) {
  const card = m.card!;
  const where = EVENT_LABEL[card.event ?? ""] ?? "";
  return (
    <div className="mt-3 flex gap-2">
      <UserAvatar name={m.userName ?? "?"} size={24} className="mt-0.5" />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{m.userName ?? "Someone"}</span> mentioned you {where} · {timeOf(m.createdAt)}
        </p>
        {m.body && (
          <div className="rounded-lg border-l-2 border-primary/50 bg-muted/50 px-2.5 py-1.5 text-sm wrap-break-word whitespace-pre-wrap">
            <MessageText body={m.body} me={me.id} />
          </div>
        )}
        <RecordCard cardRef={`${card.type}:${card.id}`} from={m.userName} />
      </div>
    </div>
  );
}
