"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ImageOff, Paperclip, Reply, ReplyAll, Forward } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { markRead } from "./actions";
import { MailFetchError, mailJson } from "./inbox-list";

interface Addr {
  name: string;
  email: string;
}
interface Message {
  uid: number;
  subject: string;
  from: Addr;
  to: Addr[];
  cc: Addr[];
  date: string | null;
  html: string | null;
  text: string;
  remoteImages: boolean;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
  seen: boolean;
}

const who = (a: Addr) => (a.name ? `${a.name} <${a.email}>` : a.email);
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * The email's HTML is already sanitised on the server. It is shown in an iframe with every sandbox right off
 * (no scripts, no forms) and a policy that blocks everything except inline images, so it cannot touch the portal.
 */
function frameDoc(html: string, images: boolean) {
  const img = images ? "data: https: http:" : "data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${img}; style-src 'unsafe-inline'"><base target="_blank"><style>body{margin:0;padding:14px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#222;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}blockquote{margin:0 0 0 6px;padding-left:10px;border-left:3px solid #ddd;color:#555}a{color:#1a56db}</style></head><body>${html}</body></html>`;
}

export function MessagePane({ uid }: { uid: number }) {
  const [images, setImages] = useState(false);
  const qc = useQueryClient();
  const q = useQuery<Message, MailFetchError>({
    queryKey: ["mail-msg", uid, images],
    queryFn: () => mailJson<Message>(`/api/mail/message?uid=${uid}${images ? "&images=1" : ""}`),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const marked = useRef<number | null>(null);

  // opening an unread email marks it read, then the list refreshes
  useEffect(() => {
    if (q.data && !q.data.seen && marked.current !== uid) {
      marked.current = uid;
      markRead(uid)
        .then(() => qc.invalidateQueries({ queryKey: ["mail-list"] }))
        .catch(() => {});
    }
  }, [q.data, uid, qc]);

  const back = (
    <Link href="/mail" className="mb-2 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground md:hidden">
      <ChevronLeft className="size-4" /> Inbox
    </Link>
  );

  if (q.isPending) {
    return (
      <div className="grid gap-3 p-4" aria-busy="true" aria-label="Loading email">
        {back}
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="p-4 text-sm">
        {back}
        <p className="text-destructive">{q.error.message}</p>
      </div>
    );
  }

  const m = q.data;
  const when = m.date
    ? new Date(m.date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })
    : "";
  return (
    <article className="grid gap-4 p-4">
      <div>
        {back}
        <h1 className="text-xl font-semibold tracking-tight">{m.subject || "(no subject)"}</h1>
        <div className="mt-1 grid gap-0.5 text-sm text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">{who(m.from)}</span> · {when}
          </div>
          {m.to.length > 0 && <div className="break-words">To: {m.to.map(who).join(", ")}</div>}
          {m.cc.length > 0 && <div className="break-words">Cc: {m.cc.map(who).join(", ")}</div>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" nativeButton={false} render={<Link href={`/mail/compose?mode=reply&uid=${m.uid}`} />}>
            <Reply /> Reply
          </Button>
          {m.to.length + m.cc.length > 1 && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/mail/compose?mode=replyall&uid=${m.uid}`} />}>
              <ReplyAll /> Reply all
            </Button>
          )}
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/mail/compose?mode=forward&uid=${m.uid}`} />}>
            <Forward /> Forward
          </Button>
        </div>
      </div>

      {m.remoteImages && !images && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <ImageOff className="size-4 text-muted-foreground" />
          <span className="flex-1">Pictures from the internet are hidden, because they can tell the sender you opened this email.</span>
          <Button size="sm" variant="outline" onClick={() => setImages(true)}>
            Load images
          </Button>
        </div>
      )}

      {m.html ? (
        <iframe
          title="Email"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={frameDoc(m.html, images)}
          className="h-[60vh] w-full rounded-lg border bg-white"
        />
      ) : (
        <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap">{m.text || "(empty message)"}</div>
      )}

      {m.attachments.length > 0 && (
        <div className="grid gap-1.5">
          <h2 className="text-sm font-medium">Attachments ({m.attachments.length})</h2>
          <div className="flex flex-wrap gap-2">
            {m.attachments.map((a) => (
              <a
                key={a.index}
                href={`/api/mail/attachment?uid=${m.uid}&i=${a.index}`}
                download
                className="inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              >
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.filename}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{size(a.size)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
