"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { markChannelRead, sendMessage } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import type { ChannelSummary, ChatMessage, ChatUser } from "@/lib/chat/types";
import { MAX_BODY } from "@/lib/chat/text";
import { addMessage, bumpChannel, chatKeys, fetchMessages, fetchThread, isReading, useOnScreen, useTypingStore, type Member } from "./chat-data";
import { Composer } from "./composer";
import { MessageRow, MessageText, timeOf, type Me } from "./message-row";

interface Pending {
  key: number;
  body: string;
  replyToId: number | null;
  failed: boolean;
}

/** Sends with an instant "Sending…" bubble that turns into the real message (or into "Not sent. Retry"). */
function useSender(channelId: number, me: number, threadId: number | null) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending[]>([]);
  const seq = useRef(0);
  const send = async (body: string, replyToId: number | null = null, retryKey?: number) => {
    if (body.length > MAX_BODY) return void toast.error(`Keep a message under ${MAX_BODY} characters.`);
    const key = retryKey ?? ++seq.current;
    setPending((p) => (retryKey ? p.map((x) => (x.key === key ? { ...x, failed: false } : x)) : [...p, { key, body, replyToId, failed: false }]));
    try {
      const m = await sendMessage({ channelId, body, replyToId, threadId });
      addMessage(qc, m);
      bumpChannel(qc, m, me, true);
      setPending((p) => p.filter((x) => x.key !== key));
    } catch (e) {
      setPending((p) => p.map((x) => (x.key === key ? { ...x, failed: true } : x)));
      toast.error((e as Error).message);
    }
  };
  return { pending, send };
}

function PendingBubbles({ pending, retry }: { pending: Pending[]; retry: (p: Pending) => void }) {
  return pending.map((p) => (
    <div key={p.key} className="mt-0.5 flex justify-end">
      <div className="max-w-[80%] text-right">
        <div
          className={`rounded-2xl rounded-br-md px-3 py-1.5 text-left text-sm wrap-break-word whitespace-pre-wrap ${p.failed ? "bg-destructive/10 text-destructive" : "bg-primary/70 text-primary-foreground"}`}
        >
          <MessageText body={p.body} />
        </div>
        {p.failed ? (
          <button type="button" className="text-[11px] text-destructive underline" onClick={() => retry(p)}>
            Not sent. Retry
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Sending…</span>
        )}
      </div>
    </div>
  ));
}

/** "Bina is typing…" while anyone else in the conversation is typing. */
function TypingLine({ channelId }: { channelId: number }) {
  const typing = useTypingStore((s) => s.typing[channelId]);
  const [now, setNow] = useState(() => Date.now());
  const active = Object.values(typing ?? {}).filter((t) => t.until > now);
  const any = !!typing && Object.keys(typing).length > 0;
  useEffect(() => {
    if (!any) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [any]);
  const names = active.map((t) => t.name.split(" ")[0]);
  return (
    <p className="h-4 shrink-0 truncate px-3 text-[11px] text-muted-foreground" aria-live="polite">
      {names.length === 0 ? "" : names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : "Several people are typing…"}
    </p>
  );
}

/** Keeps a scroll box pinned to the bottom as messages arrive, unless the reader scrolled up. */
function useStickToBottom(deps: unknown[]) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const keepFromRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (keepFromRef.current != null) {
      el.scrollTop = el.scrollHeight - keepFromRef.current;
      keepFromRef.current = null;
    } else if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { scrollerRef, atBottomRef, keepFromRef };
}

/** For each person (not me), the last loaded message they have read up to: shown as small faces under it in groups. */
function readersByMessage(messages: ChatMessage[], members: Member[], me: number): Map<number, ChatUser[]> {
  const out = new Map<number, ChatUser[]>();
  for (const u of members) {
    if (u.id === me) continue;
    let at: ChatMessage | undefined;
    for (const m of messages) if (m.id <= u.lastReadId) at = m;
    if (!at || at.userId === u.id) continue;
    out.set(at.id, [...(out.get(at.id) ?? []), { id: u.id, name: u.name }]);
  }
  return out;
}

export function Conversation({ channel, me, disabled }: { channel: ChannelSummary; me: Me; disabled?: string }) {
  const [thread, setThread] = useState<ChatMessage | null>(null);
  useOnScreen(channel.id);
  if (thread) return <ThreadView root={thread} channel={channel} me={me} onBack={() => setThread(null)} disabled={disabled} />;
  return <MainView channel={channel} me={me} onThread={setThread} disabled={disabled} />;
}

function MainView({ channel, me, onThread, disabled }: { channel: ChannelSummary; me: Me; onThread: (m: ChatMessage) => void; disabled?: string }) {
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const marked = useRef(0);
  const { pending, send } = useSender(channel.id, me.id, null);

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
  const names = new Map(members.map((u) => [u.id, u.name]));
  const last = messages.at(-1);
  const { scrollerRef, atBottomRef, keepFromRef } = useStickToBottom([messages.length, pending.length]);

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

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 60 && q.hasNextPage && !q.isFetchingNextPage) {
      keepFromRef.current = el.scrollHeight - el.scrollTop;
      void q.fetchNextPage();
    }
  };

  const peer = channel.kind === "dm" ? members.find((u) => u.id !== me.id) : undefined;
  const lastMine = [...messages].reverse().find((m) => m.userId === me.id);
  const readers = channel.kind === "dm" ? null : readersByMessage(messages, members, me.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2">
        {q.isPending && <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>}
        {q.isError && <p className="py-8 text-center text-xs text-destructive">{(q.error as Error).message}</p>}
        {q.isFetchingNextPage && <p className="py-1 text-center text-[11px] text-muted-foreground">Loading older messages…</p>}
        {!q.isPending && !messages.length && !pending.length && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {channel.kind === "dm" ? `No messages yet. Say hello to ${channel.name}.` : channel.kind === "record" ? "No messages yet. Talk about this deal with its team here." : "No messages yet. Start the conversation."}
          </p>
        )}
        {messages.map((m, i) => (
          <MessageRow
            key={m.id}
            m={m}
            prev={messages[i - 1]}
            me={me}
            names={names}
            seen={!!peer && m.id === lastMine?.id && peer.lastReadId >= m.id}
            readers={readers?.get(m.id)}
            actions={{ onReply: setReplyTo, onThread }}
          />
        ))}
        <PendingBubbles pending={pending} retry={(p) => send(p.body, p.replyToId, p.key)} />
      </div>
      <TypingLine channelId={channel.id} />
      <Composer
        channelId={channel.id}
        draftKey={channel.id}
        placeholder={`Message ${channel.kind === "group" ? `#${channel.name}` : channel.name}`}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabled={disabled}
        onSend={(text) => {
          atBottomRef.current = true;
          void send(text, replyTo?.id ?? null);
          setReplyTo(null);
        }}
      />
    </div>
  );
}

function ThreadView({ root: start, channel, me, onBack, disabled }: { root: ChatMessage; channel: ChannelSummary; me: Me; onBack: () => void; disabled?: string }) {
  const { pending, send } = useSender(channel.id, me.id, start.id);
  const q = useQuery({ queryKey: chatKeys.thread(start.id), queryFn: () => fetchThread(start.id), staleTime: Infinity });
  const root = q.data?.root ?? start;
  const replies = q.data?.replies ?? [];
  const names = new Map(channel.members.map((u) => [u.id, u.name]));
  const { scrollerRef, atBottomRef } = useStickToBottom([replies.length, pending.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-1.5 text-xs">
        <Button variant="ghost" size="icon-xs" onClick={onBack} aria-label="Back to the conversation">
          <ArrowLeft />
        </Button>
        <span className="font-medium">Thread</span>
        <span className="truncate text-muted-foreground">
          · {root.userName ?? "Portal"}, {timeOf(root.createdAt)}
        </span>
      </div>
      <div
        ref={scrollerRef}
        onScroll={() => {
          const el = scrollerRef.current;
          if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2"
      >
        <MessageRow m={root} me={me} names={names} actions={{}} />
        <div className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {root.replyCount} {root.replyCount === 1 ? "reply" : "replies"}
          <span className="h-px flex-1 bg-border" />
        </div>
        {q.isPending && <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>}
        {q.isError && <p className="py-4 text-center text-xs text-destructive">{(q.error as Error).message}</p>}
        {replies.map((m, i) => (
          <MessageRow key={m.id} m={m} prev={replies[i - 1]} me={me} names={names} actions={{}} />
        ))}
        <PendingBubbles pending={pending} retry={(p) => send(p.body, null, p.key)} />
      </div>
      <Composer
        channelId={channel.id}
        draftKey={-start.id}
        placeholder="Reply in thread"
        disabled={disabled}
        onSend={(text) => {
          atBottomRef.current = true;
          void send(text);
        }}
      />
    </div>
  );
}
