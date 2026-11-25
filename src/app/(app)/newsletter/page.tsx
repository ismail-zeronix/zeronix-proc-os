import { Plus } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listCampaigns } from "@/lib/newsletter/data";
import { cooloffDays, readyMailboxes } from "@/lib/newsletter/send";
import { templateName } from "@/lib/newsletter/templates";
import { CooloffButton } from "./campaign-controls";

export const metadata = { title: "Newsletters · Zeronix Outreach" };

const STATUS: Record<string, string> = { draft: "Draft", sending: "Sending", paused: "Paused", done: "Finished" };

export default async function NewsletterHome({ searchParams }: PageProps<"/newsletter">) {
  await requireApp("newsletter");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const [{ rows, total }, ready, cooloff] = await Promise.all([listCampaigns(page, PAGE_SIZE), readyMailboxes(), cooloffDays()]);
  return (
    <div className="grid gap-3">
      <PageToolbar title="Newsletters" meta={`${total} newsletter${total === 1 ? "" : "s"} · ${ready.length} sending mailbox${ready.length === 1 ? "" : "es"} ready`}>
        <CooloffButton days={cooloff} />
        <Button size="sm" nativeButton={false} render={<Link href="/newsletter/campaigns/new" />}>
          <Plus /> New newsletter
        </Button>
      </PageToolbar>
      {!ready.length && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          No sending mailbox is ready. Newsletters are sent from the Prospecting mailboxes: connect one and switch it on in <Link href="/prospecting/settings" className="underline">Prospecting › Settings</Link>.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Newsletter</TableHead>
              <TableHead>List</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Waiting</TableHead>
              <TableHead className="text-right">Failed / skipped</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-1.5 font-medium">
                  <Link href={`/newsletter/campaigns/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                  <div className="max-w-80 truncate text-xs font-normal text-muted-foreground">
                    {templateName(c.templateKey)} · {c.subject}
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-xs">{c.listName ?? "-"}</TableCell>
                <TableCell className="py-1.5 text-xs">{STATUS[c.status]}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{c.sent}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{c.queued}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {c.failed} / {c.skipped}
                </TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{ago(c.createdAt)}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Empty>No newsletters yet. Press New newsletter, pick a template, choose a list and send.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pager path="/newsletter" params={sp} page={page} total={total} />
    </div>
  );
}
