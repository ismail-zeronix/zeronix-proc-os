import { Plus } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { listMailboxes } from "@/lib/prospecting/data";
import { listCampaigns, listSequences } from "@/lib/prospecting/outreach";
import { CampaignDialog } from "./campaign-ui";
import { MessageSquarePlus } from "lucide-react";

export const metadata = { title: "Campaigns · Zeronix Prospecting" };

const STATUS: Record<string, string> = { active: "Running", paused: "Paused", finished: "Finished", draft: "Draft" };

export default async function CampaignsPage({ searchParams }: PageProps<"/prospecting/campaigns">) {
  await requireApp("prospecting");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const [{ rows, total }, sequences, mailboxes] = await Promise.all([listCampaigns(page, PAGE_SIZE), listSequences(), listMailboxes()]);
  const n = (c: Record<string, number>, ...keys: string[]) => keys.reduce((s, k) => s + (c[k] ?? 0), 0);
  return (
    <div className="grid gap-3">
      <PageToolbar title="Campaigns" meta={`${total} campaign${total === 1 ? "" : "s"}`}>
        <Button size="sm" nativeButton={false} render={<Link href="/prospecting/campaigns/new" />}>
          <MessageSquarePlus /> New campaign
        </Button>
        <CampaignDialog
          sequences={sequences.map((s) => ({ id: s.id, name: s.name }))}
          mailboxes={mailboxes.map((m) => ({ id: m.id, name: m.email, enabled: m.enabled }))}
          trigger={
            <Button variant="outline" size="icon-sm" aria-label="Blank campaign (advanced)" title="Blank campaign (advanced): pick a sequence and add prospects by hand">
              <Plus />
            </Button>
          }
        />
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Campaign</TableHead>
              <TableHead>Sequence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Writing / review</TableHead>
              <TableHead className="text-right">Emailing</TableHead>
              <TableHead className="text-right">Replied</TableHead>
              <TableHead className="text-right">Done</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-1.5 font-medium">
                  <Link href={`/prospecting/campaigns/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                  {c.ownerName && <div className="text-xs font-normal text-muted-foreground">{c.ownerName}</div>}
                </TableCell>
                <TableCell className="py-1.5 text-xs">{c.sequenceName}</TableCell>
                <TableCell className="py-1.5 text-xs">{STATUS[c.status] ?? c.status}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{n(c.counts, "writing", "draft")}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{n(c.counts, "active", "paused")}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{n(c.counts, "replied")}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{n(c.counts, "completed", "stopped", "bounced", "unsubscribed")}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Empty>No campaigns yet. Press New campaign: a short chat picks the prospects, AI writes each email and they go out with your signature.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pager path="/prospecting/campaigns" params={sp} page={page} total={total} />
    </div>
  );
}
