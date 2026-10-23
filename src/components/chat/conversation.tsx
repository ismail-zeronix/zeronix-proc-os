"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { markChannelRead, sendMessage } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { ChannelSummary, ChatMessage } from "@/lib/chat/types";
import { MAX_BODY, tokensToText } from "@/lib/chat/text";
import { dayLabel, dubaiToday, TZ } from "@/lib/dates";
import { addMessage, bumpChannel, chatKeys, fetchMessages, isReading } from "./chat-data";
import { useChatStore } from "./chat-store";

/** Messages from the same person within this long sit together under one name. */
const GROUP_MS = 5 * 60_000;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Plain text with web links made clickable; mention tokens read as "@Name". */
function MessageText({ body }: { body: string }) {
  const parts = tokensToText(body).split(/(https?:\/\/[^\s<]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

interface Pending {
  key: number;
  body: string;
  failed: boolean;
}

export function Conversation({ channel, me }: { channel: ChannelSummary; me: number }) {
  const qc = useQueryClient();
  const draft = useChatStore((s) => s.drafts[channel.id] ?? "");
  const setDraft = useChatStore((s) => s.setDraft);
  const [pending, setPending] = useState<Pending[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const keepFrom = useRef<number | null>(null);
  const marked = useRef(0);
  const pendingSeq = useRef(0);

  const q = useInfiniteQuery({
    queryKey: chatKeys.messages(channel.id),
    queryFn: ({ pageParam }) => fetchMessages(channel.id, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
    staleTime: Infinity,
  });
  const pages = q.data?.pages ?? [];
  const messages = [...pages].reverse().flatMap((p) => p.messages);
  const members = pages[0]?.members ?? [];
  const last = messages.at(-1);

  // tell the server (and my other tabs) that I have read up to the newest message
  useEffect(() => {
    const mark = () => {
      if (!last || last.id <= marked.current || !isReading(channel.id)) return;
      marked.current = last.id;
      qc.setQueryData<ChannelSummary[]>(chatKeys.channels, (l) => l?.map((c) => (c.id === channel.id ? { ...c, unread: 0 } : c)));
      markChannelRead(channel.id, last.id).catch(() => {
        marked.current = 0;
      });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [last, channel.id, qc]);

  // stay at the bottom as messages arrive (unless scrolled up to read older ones); keep the place when older ones load
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepFrom.current != null) {
      el.scrollTop = el.scrollHeight - keepFrom.current;
      keepFrom.current = null;
    } else if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending.length]);

  useEffect(() => input.current?.focus(), [channel.id]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 60 && q.hasNextPage && !q.isFetchingNextPage) {
      keepFrom.current = el.scrollHeight - el.scrollTop;
      void q.fetchNextPage();
    }
  };

  const send = async (body: string, retryKey?: number) => {
    const text = body.trim();
    if (!text) return;
    if (text.length > MAX_BODY) return void toast.error(`Keep a message under ${MAX_BODY} characters.`);
    const key = retryKey ?? ++pendingSeq.current;
    setPending((p) => (retryKey ? p.map((x) => (x.key === key ? { ...x, failed: false } : x)) : [...p, { key, body: text, failed: false }]));
    if (!retryKey) setDraft(channel.id, "");
    atBottom.current = true;
    try {
      const m = await sendMessage({ channelId: channel.id, body: text });
      addMessage(qc, m);
      bumpChannel(qc, m, me, true);
      setPending((p) => p.filter((x) => x.key !== key));
    } catch (e) {
      setPending((p) => p.map((x) => (x.key === key ? { ...x, failed: true } : x)));
      toast.error((e as Error).message);
    }
  };

  const peer = channel.kind === "dm" ? members.find((u) => u.id !== me) : undefined;
  const seenUpTo = peer?.lastReadId ?? 0;
  const lastMine = [...messages].reverse().find((m) => m.userId === me);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-live="polite">
        {q.isPending && <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>}
        {q.isError && <p className="py-8 text-center text-xs text-destructive">{(q.error as Error).message}</p>}
        {q.isFetchingNextPage && <p className="py-1 text-center text-[11px] text-muted-foreground">Loading older messages…</p>}
        {!q.isPending && !messages.length && !pending.length && (
          <p className="py-8 text-center text-xs text-muted-foreground">No messages yet. Say hello to {channel.name}.</p>
        )}
        {messages.map((m, i) => (
          <MessageRow key={m.id} m={m} prev={messages[i - 1]} me={me} seen={channel.kind === "dm" && m.id === lastMine?.id && seenUpTo >= m.id} />
        ))}
        {pending.map((p) => (
          <div key={p.key} className="mt-0.5 flex justify-end">
            <div className="max-w-[80%] text-right">
              <div className={`rounded-2xl rounded-br-md px-3 py-1.5 text-left text-sm whitespace-pre-wrap wrap-break-word ${p.failed ? "bg-destructive/10 text-destructive" : "bg-primary/70 text-primary-foreground"}`}>
                {p.body}
              </div>
              {p.failed ? (
                <button type="button" className="text-[11px] text-destructive underline" onClick={() => send(p.body, p.key)}>
                  Not sent. Retry
                </button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Sending…</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex items-end gap-1.5 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          ref={input}
          value={draft}
          onChange={(e) => setDraft(channel.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          maxLength={MAX_BODY}
          placeholder={`Message ${channel.name}`}
          aria-label={`Message ${channel.name}`}
          className="field-sizing-content max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send" title="Send (Enter)">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  );
}

function MessageRow({ m, prev, me, seen }: { m: ChatMessage; prev?: ChatMessage; me: number; seen: boolean }) {
  const day = dubaiToday(new Date(m.createdAt));
  const newDay = !prev || dubaiToday(new Date(prev.createdAt)) !== day;
  const grouped = !newDay && !!prev && prev.userId === m.userId && prev.kind !== "system" && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
  const mine = m.userId === me;

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
      ) : (
        <div className={`flex gap-2 ${mine ? "justify-end" : ""} ${grouped ? "mt-0.5" : "mt-2"}`}>
          {!mine && (grouped ? <span className="w-6 shrink-0" /> : <UserAvatar name={m.userName ?? "?"} size={24} className="mt-0.5" />)}
          <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
            {!grouped && (
              <span className="mb-0.5 text-[11px] text-muted-foreground">
                {!mine && <span className="mr-1 font-medium text-foreground">{m.userName ?? "Portal"}</span>}
                {timeOf(m.createdAt)}
              </span>
            )}
            <div
              title={grouped ? timeOf(m.createdAt) : undefined}
              className={`rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap wrap-break-word ${
                m.deletedAt ? "italic text-muted-foreground border" : mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"
              }`}
            >
              {m.deletedAt ? "Message deleted" : <MessageText body={m.body} />}
              {m.editedAt && !m.deletedAt && <span className="ml-1 text-[10px] opacity-70">(edited)</span>}
            </div>
            {seen && <span className="mt-0.5 text-[11px] text-muted-foreground">Seen</span>}
          </div>
        </div>
      )}
    </>
  );
}
