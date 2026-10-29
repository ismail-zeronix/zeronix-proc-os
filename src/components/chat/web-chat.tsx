"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, Globe, Handshake, Mail, Phone, SendHorizontal, SquareArrowOutUpRight, Star } from "lucide-react";
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
export function WebChatList({ me }: { me: Me }) {
  const web = useWebChats();
  const show = useChatStore((s) => s.show);
  const qc = useQueryClient();
  const chats = web.data?.chats ?? [];

  if (web.isPending) return <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>;
  if (web.error) return <p className="py-8 text-center text-xs text-destructive">{(web.error as Error).message}</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {!chats.length && (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Globe className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No visitors right now. When someone opens www.zeronix.ae, they show up here and the portal rings.</p>
        </div>
      )}
      {GROUPS.map((g) => {
        const rows = chats.filter((c) => c.status === g.key);
        if (!rows.length) return null;
        return (
          <section key={g.key}>
            <h3 className="sticky top-0 z-1 bg-popover/95 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
              {g.label} · {rows.length}
            </h3>
            <ul>
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => show({ kind: "web", id: c.id })}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
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
export function WebConversation({ id, me, detailsBeside = false }: { id: number; me: Me; detailsBeside?: boolean }) {
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
  const back = () => show({ kind: "list" });
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
function SaveLeadButton({ chat, compact = false }: { chat: WebChatSummary; compact?: boolean }) {
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

/** "Chrome on Windows · desktop", from the browser's user agent. */
function deviceOf(ua: string): string {
  if (!ua) return "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const kind = /Mobi|iPhone|Android.+Mobile/.test(ua) ? "phone" : /iPad|Tablet/.test(ua) ? "tablet" : "desktop";
  return `${browser}${os ? ` on ${os}` : ""} · ${kind}`;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dubaiToday(d) === dubaiToday() ? "Today" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ })} ${timeOf(iso)}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

/** The visitor's details beside a website chat on the Chat page: what they filled in, where they browsed, their rating. */
export function WebVisitorPanel({ id }: { id: number }) {
  const web = useWebChats();
  const thread = useWebThread(id);
  const chat = web.data?.chats.find((c) => c.id === id);
  const info = thread.data?.info;
  if (!chat) return null;
  const question = thread.data?.messages.find((m) => m.sender === "visitor")?.body;
  let referrer = "";
  try {
    referrer = info?.referrer ? new URL(info.referrer).hostname : "";
  } catch {
    referrer = info?.referrer ?? "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-3 text-sm font-medium">Visitor details</header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="flex items-center gap-2.5">
          {chat.lead ? (
            <UserAvatar name={chat.lead.name} size={40} />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Globe className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{chat.lead?.name ?? `Visitor #${chat.id}`}</p>
            <p className="truncate text-xs text-muted-foreground">{chat.lead?.company || (chat.online ? "On the website now" : "Left the website")}</p>
          </div>
        </div>

        {chat.lead ? <SaveLeadButton chat={chat} /> : <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">They have not filled in the form yet.</p>}

        <dl className="grid gap-3">
          <Row label="Email">
            {chat.lead?.email && (
              <a href={`mailto:${chat.lead.email}`} className="text-primary hover:underline">
                {chat.lead.email}
              </a>
            )}
          </Row>
          <Row label="Phone">
            {chat.lead?.phone && (
              <span className="flex flex-wrap gap-x-3">
                <a href={`tel:${chat.lead.phone}`} className="text-primary hover:underline">
                  {chat.lead.phone}
                </a>
                <a href={`https://wa.me/${chat.lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  WhatsApp
                </a>
              </span>
            )}
          </Row>
          <Row label="Company">{chat.lead?.company}</Row>
          <Row label="Their question">{question && <span className="whitespace-pre-wrap">{question}</span>}</Row>
        </dl>

        {info?.rating != null && (
          <section className="grid gap-1.5 rounded-lg border p-2.5">
            <h3 className="text-[11px] text-muted-foreground">Their rating</h3>
            <Stars value={info.rating} />
            {info.feedbackTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {info.feedbackTags.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {info.feedback && <p className="text-sm whitespace-pre-wrap">“{info.feedback}”</p>}
          </section>
        )}

        <dl className="grid gap-3 border-t pt-3">
          <Row label="Now on">
            <a href={chat.pageUrl} target="_blank" rel="noreferrer" className="hover:underline">
              {chat.pageTitle || pathOf(chat.pageUrl)}
            </a>
          </Row>
          <Row label="Came from">{info && (referrer || "Typed the address or a bookmark")}</Row>
          <Row label="Device">{info && deviceOf(info.userAgent)}</Row>
          <Row label="IP address">{info?.ip}</Row>
          <Row label="Started">{info && when(info.createdAt)}</Row>
          <Row label="Accepted">{info?.acceptedAt && `${when(info.acceptedAt)}${chat.agent ? ` by ${chat.agent.name}` : ""}`}</Row>
          <Row label="Ended">{info?.closedAt && `${when(info.closedAt)}${info.closedBy === "visitor" ? " by the visitor" : info.closedBy === "agent" ? " by sales" : ""}`}</Row>
        </dl>

        {!!info?.pages.length && (
          <section className="grid gap-1 border-t pt-3">
            <h3 className="text-[11px] text-muted-foreground">Pages visited ({info.pages.length})</h3>
            <ol className="grid gap-1">
              {info.pages
                .slice()
                .reverse()
                .map((p, i) => (
                  <li key={`${p.at}-${i}`} className="flex items-baseline gap-2 text-xs">
                    <span className="shrink-0 text-muted-foreground tabular-nums">{timeOf(p.at)}</span>
                    <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline" title={p.url}>
                      {p.title || pathOf(p.url)}
                    </a>
                  </li>
                ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
