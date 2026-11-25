import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";
import { reviewCount } from "@/lib/prospecting/outreach";
import { repliesWaiting } from "@/lib/prospecting/work";
import { OutreachTabs } from "../prospecting/outreach-tabs";

/** Newsletters live inside Outreach: same sidebar, same tabs. */
export default async function NewsletterLayout({ children }: LayoutProps<"/newsletter">) {
  const access = await requireApp("newsletter");
  const full = access.user.role === "admin" || access.seesAll;
  const [review, replies] = await Promise.all([full ? reviewCount() : 0, repliesWaiting(full ? undefined : access.user.id)]);
  return (
    <AppShell app="prospecting" badges={{ review, replies }} perms={{ outreachFull: full }}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <OutreachTabs full={full} />
        {children}
      </div>
    </AppShell>
  );
}
