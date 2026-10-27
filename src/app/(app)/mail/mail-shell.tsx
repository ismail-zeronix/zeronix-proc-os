"use client";

import { ExternalLink, PenSquare } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InboxList } from "./inbox-list";

/**
 * Two panes on a wide screen (inbox list, reading pane). On a phone only one shows at a time:
 * the list on /mail, the message or compose form on any page below it.
 */
export function MailShell({ children, webmailUrl }: { children: React.ReactNode; webmailUrl: string }) {
  const pathname = usePathname();
  const detail = pathname !== "/mail";
  return (
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[22rem_1fr]">
      <section className={`min-h-0 flex-col rounded-xl border bg-card ${detail ? "hidden md:flex" : "flex"}`} aria-label="Inbox">
        <div className="flex items-center gap-2 border-b p-2">
          <Button nativeButton={false} render={<Link href="/mail/compose" />} size="sm">
            <PenSquare /> Write
          </Button>
          <span className="flex-1 text-sm font-medium">Inbox</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open webmail in a new tab"
            title="Open webmail (spam, rules, other folders)"
            nativeButton={false}
            render={<a href={webmailUrl} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink />
          </Button>
        </div>
        <InboxList />
      </section>
      <section className={`min-h-0 overflow-y-auto rounded-xl border bg-card ${detail ? "block" : "hidden md:block"}`} aria-label="Message">
        {children}
      </section>
    </div>
  );
}
