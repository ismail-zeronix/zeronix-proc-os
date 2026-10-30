"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, Globe, Handshake, Info, Mail, Phone, Search, SendHorizontal, SquareArrowOutUpRight, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { acceptWebChat, closeWebChat, markWebChatRead, saveWebLead, sendWebMessage, setWebRing } from "@/app/(app)/chat/web-actions";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { dubaiToday, TZ } from "@/lib/dates";
import { MAX_WEB_BODY, pathOf, visitorLabel, type WebChatSummary } from "@/lib/webchat/types";
import { useChatStore } from "./chat-store";
import { timeOf, type Me } from "./message-row";
import { PanelHeader } from "./panel-bits";
import { addWebMessage, setReadingWeb, useWebChats, useWebThread, useWebTyping, webKeys } from "./web-data";

/** Waiting chats, then live ones, then ended: how the Website tab groups them. */
const GROUPS = [
  { key: "waiting", label: "Waiting" },
  { key: "active", label: "Live" },
  { key: "closed", label: "Ended (last 7 days)" },
] as const;

/** Badge on the Website tab: visitors waiting, plus unread lines on my chats. */
export function webBadge(chats: WebChatSummary[]): number {
  return chats.reduce((n, c) => n + (c.status === "waiting" && (c.online || c.lead) ? 1 : 0) + c.unread, 0);
}

function StatusDot({ c }: { c: WebChatSummary }) {
  if (c.status === "closed") return null;
  return (
    <span
      className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-popover ${c.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
      title={c.online ? "On the website now" : "Left the website"}
    />
  );
}

/** The Website tab of the chat: one row per visitor. */
export function WebChatList({ me, onOpen, selectedId, searchable = false }: { me: Me; onOpen?: (id: number) => void; selectedId?: number | null; searchable?: boolean }) {
  const web = useWebChats();
  const show = useChatStore((s) => s.show);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | WebChatSummary["status"]>("all");
  const needle = q.trim().toLowerCase();
  const chats = (web.data?.chats ?? []).filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      (!needle || [c.lead?.name, c.lead?.email, c.lead?.company, c.lead?.phone, c.place, c.pageTitle, c.pageUrl].some((v) => v?.toLowerCase().includes(needle))),
  );
  const open = onOpen ?? ((id: number) => show({ kind: "web", id }));

  if (web.isPending) return <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>;
  if (web.error) return <p className="py-8 text-center text-xs text-destructive">{(web.error as Error).message}</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {searchable && (
        <div className="sticky top-0 z-2 grid gap-1.5 border-b bg-card p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company, place, page"
              aria-label="Search website chats"
              className="h-8 w-full rounded-lg border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <div className="flex gap-1" role="tablist" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["waiting", "Waiting"],
                ["active", "Live"],
                ["closed", "Ended"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className={`h-7 rounded-md px-2 text-xs ${filter === k ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/60"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!chats.length && (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Globe className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {needle || filter !== "all" ? "No website chats match." : "No visitors right now. When someone opens www.zeronix.ae, they show up here and the portal rings."}
          </p>
        </div>
      )}
      {GROUPS.map((g) => {
        const rows = chats.filter((c) => c.status === g.key);
        if (!rows.length) return null;
        return (
          <section key={g.key}>
            <h3 className="z-1 bg-popover/95 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
              {g.label} · {rows.length}
            </h3>
            <ul>
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    aria-current={selectedId === c.id || undefined}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none ${selectedId === c.id ? "bg-muted" : ""}`}
                  >
                    <span className="relative shrink-0">
                      {c.lead ? (
                        <UserAvatar name={c.lead.name} size={34} />
                      ) : (
                        <span className="flex size-[34px] items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Globe className="size-4" />
                        </span>
                      )}
                      <StatusDot c={c} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`flex-1 truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>{visitorLabel(c)}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(c.lastMessageAt ?? c.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex-1 truncate text-xs ${c.unread ? "text-foreground" : "text-muted-foreground"}`}>
                          {c.status === "active" && c.agent ? <span className="text-muted-foreground">{c.agent.id === me.id ? "You" : c.agent.name.split(" ")[0]} · </span> : null}
                          {c.lastPreview || (c.lead ? "Sent the form" : `Browsing ${pathOf(c.pageUrl)}`)}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{c.unread}</span>
                        )}
                        {c.status === "waiting" && c.online && <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Waiting</span>}
                        {c.dealId && <Handshake className="size-3.5 shrink-0 text-muted-foreground" aria-label="Saved to leads" />}
                        {c.rating != null && <Stars value={c.rating} small />}
                      </div>
                      {(c.place || c.visits > 1) && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.place}
                          {c.place && c.visits > 1 && " · "}
                          {c.visits > 1 && <span className="font-medium text-teal-700 dark:text-teal-400">Returning · visit {c.visits}</span>}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {me.isAdmin && web.data && (
        <label className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          Ring for
          <select
            value={web.data.ring}
            onChange={async (e) => {
              try {
                await setWebRing(e.target.value as "visitors" | "leads");
                await qc.invalidateQueries({ queryKey: webKeys.list, exact: true });
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
            className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs text-foreground"
          >
            <option value="visitors">every visitor on the site</option>
            <option value="leads">visitors who send the form</option>
          </select>
        </label>
      )}
    </div>
  );
}

/** One website chat: who the visitor is, the lines, and Accept / reply / End. */
export function WebConversation({
  id,
  me,
  detailsBeside = false,
  onBack,
  onDetails,
}: {
  id: number;
  me: Me;
  detailsBeside?: boolean;
  onBack?: () => void;
  /** Opens the visitor details (a drawer where they are not beside the chat). */
  onDetails?: () => void;
}) {
  const web = useWebChats();
  const thread = useWebThread(id);
  const show = useChatStore((s) => s.show);
  const qc = useQueryClient();
  const chat = web.data?.chats.find((c) => c.id === id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const typingUntil = useWebTyping((s) => s.until[id] ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const back = onBack ?? (() => show({ kind: "list" }));
  const mine = chat?.status === "active" && chat.agent?.id === me.id;
  const messages = thread.data?.messages ?? [];
  const lastId = messages.at(-1)?.id ?? 0;

  useEffect(() => {
    setReadingWeb(id);
    return () => setReadingWeb(null);
  }, [id]);

  // seen: my unread count clears
  useEffect(() => {
    if (!mine || !lastId || !chat?.unread) return;
    void markWebChatRead(id, lastId).then(() => qc.invalidateQueries({ queryKey: webKeys.list, exact: true }));
  }, [mine, lastId, id, chat?.unread, qc]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (typingUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [typingUntil]);

  if (!chat) {
    return (
      <>
        <PanelHeader title="Website chat" onBack={back} />
        <p className="py-8 text-center text-xs text-muted-foreground">{web.isFetching ? "Loading…" : "This visitor left without sending the form."}</p>
      </>
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: webKeys.list, exact: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (body.length > MAX_WEB_BODY) return void toast.error(`Keep a message under ${MAX_WEB_BODY} characters.`);
    setText("");
    try {
      addWebMessage(qc, await sendWebMessage(id, body));
    } catch (e) {
      setText(body);
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PanelHeader onBack={back}>
        <span className="relative shrink-0">
          {chat.lead ? <UserAvatar name={chat.lead.name} size={28} /> : <Globe className="m-1 size-5 text-muted-foreground" />}
          <StatusDot c={chat} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{visitorLabel(chat)}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {chat.status === "closed"
              ? "Ended"
              : chat.status === "waiting"
                ? chat.online
                  ? "Waiting for someone to accept"
                  : "Left the site · waiting for a reply by email"
                : `${mine ? "You are" : `${chat.agent?.name ?? "Someone"} is`} on this chat${chat.online ? "" : " · visitor left the site"}`}
          </p>
        </div>
        {onDetails && (
          <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={onDetails} aria-label="Visitor details" title="Visitor details">
            <Info />
          </Button>
        )}
        {chat.status === "waiting" && (
          <Button size="sm" onClick={() => run(() => acceptWebChat(id))} disabled={busy}>
            Accept
          </Button>
        )}
        {chat.status === "active" && !mine && (
          <Button size="sm" variant="outline" onClick={() => run(() => acceptWebChat(id, true))} disabled={busy}>
            Take over
          </Button>
        )}
        {mine &&
          (ending ? (
            <span className="flex items-center gap-1">
              <Button size="sm" variant="destructive" onClick={() => void run(() => closeWebChat(id)).then(() => setEnding(false))} disabled={busy}>
                End chat
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEnding(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEnding(true)} disabled={busy}>
              End
            </Button>
          ))}
      </PanelHeader>

      {/* on the Chat page the visitor panel sits beside the chat on wide screens; the strip covers narrower ones */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs ${detailsBeside ? "xl:hidden" : ""}`}>
        {chat.lead?.email && (
          <a href={`mailto:${chat.lead.email}`} className="flex min-w-0 items-center gap-1 hover:underline">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{chat.lead.email}</span>
          </a>
        )}
        {chat.lead?.phone && (
          <a href={`tel:${chat.lead.phone}`} className="flex items-center gap-1 hover:underline">
            <Phone className="size-3.5 text-muted-foreground" />
            {chat.lead.phone}
          </a>
        )}
        {chat.lead?.company && (
          <span className="flex items-center gap-1">
            <Building2 className="size-3.5 text-muted-foreground" />
            {chat.lead.company}
          </span>
        )}
        <a href={chat.pageUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-muted-foreground hover:underline" title={chat.pageUrl}>
          <SquareArrowOutUpRight className="size-3.5 shrink-0" />
          <span className="truncate">{chat.pageTitle || pathOf(chat.pageUrl)}</span>
        </a>
        {!chat.lead && <span className="text-muted-foreground">Has not sent the form yet</span>}
        {chat.lead && <SaveLeadButton chat={chat} compact />}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {thread.isPending && <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>}
        {thread.data && !messages.length && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {chat.lead ? "No messages yet." : "The visitor is browsing the site. Accept to greet them; the chat opens on their screen."}
          </p>
        )}
        {messages.map((m, i) => {
          if (m.sender === "system")
            return (
              <p key={m.id} className="my-2 text-center text-[11px] text-muted-foreground">
                {m.body} · {timeOf(m.createdAt)}
              </p>
            );
          const fromVisitor = m.sender === "visitor";
          const first = messages[i - 1]?.sender !== m.sender || messages[i - 1]?.name !== m.name;
          return (
            <div key={m.id} className={`flex ${fromVisitor ? "justify-start" : "justify-end"} ${first ? "mt-2" : "mt-0.5"}`}>
              <div className={`max-w-[80%] ${fromVisitor ? "" : "text-right"}`}>
                {first && <p className="mb-0.5 text-[11px] text-muted-foreground">{fromVisitor ? (chat.lead?.name ?? "Visitor") : (m.name ?? "Sales")} · {timeOf(m.createdAt)}</p>}
                <div
                  className={`rounded-2xl px-3 py-1.5 text-left text-sm wrap-break-word whitespace-pre-wrap ${fromVisitor ? "rounded-bl-md bg-muted" : "rounded-br-md bg-primary text-primary-foreground"}`}
                >
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="h-4 shrink-0 truncate px-3 text-[11px] text-muted-foreground" aria-live="polite">
        {typingUntil > now ? `${chat.lead?.name.split(" ")[0] ?? "Visitor"} is typing…` : ""}
      </p>

      {mine ? (
        <form
          className="flex items-end gap-1.5 border-t p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={MAX_WEB_BODY}
            autoFocus
            placeholder={chat.online ? "Reply to the visitor" : "The visitor left; they see it if they come back"}
            aria-label="Reply to the visitor"
            className="field-sizing-content max-h-32 min-h-9 w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Send" title="Send (Enter)">
            <SendHorizontal />
          </Button>
        </form>
      ) : (
        <p className="border-t p-3 text-center text-xs text-muted-foreground">
          {chat.status === "waiting"
            ? "Accept the chat to reply."
            : chat.status === "active"
              ? `${chat.agent?.name ?? "A colleague"} is answering. Take over to reply.`
              : chat.lead?.email
                ? `This chat has ended. Follow up by email: ${chat.lead.email}`
                : "This chat has ended."}
        </p>
      )}
    </>
  );
}

/** "14:05" today, "12 Oct" before that (UAE time). */
function shortTime(iso: string): string {
  const d = new Date(iso);
  if (dubaiToday(d) === dubaiToday()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
}

/** 1-5 stars as the visitor rated the chat. */
export function Stars({ value, small = false }: { value: number; small?: boolean }) {
  return (
    <span className="flex shrink-0 items-center" aria-label={`${value} of 5 stars`} title={`Rated ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${small ? "size-3" : "size-4"} ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      ))}
    </span>
  );
}

/** "Save to leads" (a CRM lead at New, source Website), or a link to the lead once saved. */
export function SaveLeadButton({ chat, compact = false }: { chat: WebChatSummary; compact?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (chat.dealId)
    return (
      <Button size={compact ? "xs" : "sm"} variant="outline" nativeButton={false} render={<Link href={`/crm/deals/${chat.dealId}`} />} className={compact ? "ml-auto" : "w-full"}>
        <Handshake /> Open lead
      </Button>
    );
  return (
    <Button
      size={compact ? "xs" : "sm"}
      className={compact ? "ml-auto" : "w-full"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await saveWebLead(chat.id);
          await qc.invalidateQueries({ queryKey: webKeys.list, exact: true });
          await qc.invalidateQueries({ queryKey: webKeys.thread(chat.id) });
          toast.success(r.reusedCompany ? `Saved to leads, under the existing company ${r.reusedCompany}.` : "Saved to leads.");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Handshake /> {busy ? "Saving…" : "Save to leads"}
    </Button>
  );
}
