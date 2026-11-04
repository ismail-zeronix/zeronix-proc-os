import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Segmented } from "@/components/segmented";
import { StatStrip } from "@/components/stat-strip";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { listMailboxes } from "@/lib/prospecting/data";
import { campaignEnrollments, getCampaign, listSequences } from "@/lib/prospecting/outreach";
import { CampaignDialog, CampaignStatusButtons, RefreshWhile, StopEnrollmentButton } from "../campaign-ui";

export const metadata = { title: "Campaign · Zeronix Prospecting" };

const LABEL: Record<string, string> = {
  writing: "AI writing",
  draft: "Waiting for review",
  active: "Emailing",
  paused: "Paused",
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  completed: "No reply",
  stopped: "Stopped",
  skipped: "Skipped",
};
const FILTERS = [
  { key: "", label: "All" },
  { key: "writing", label: "AI writing" },
  { key: "draft", label: "Review" },
  { key: "active", label: "Emailing" },
  { key: "replied", label: "Replied" },
  { key: "completed", label: "No reply" },
  { key: "stopped", label: "Stopped" },
];

export default async function CampaignPage({ params, searchParams }: PageProps<"/prospecting/campaigns/[id]">) {
  await requireApp("prospecting");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in LABEL ? sp.status : undefined;
  const page = pageParam(sp.page);
  const [c, { rows, total }, sequences, mailboxes] = await Promise.all([getCampaign(id), campaignEnrollments(id, status, page, PAGE_SIZE), listSequences(), listMailboxes()]);
  if (!c) notFound();
  const n = (...keys: string[]) => keys.reduce((s, k) => s + (c.counts[k] ?? 0), 0);
  const sent = n("active", "paused", "replied", "bounced", "unsubscribed", "completed", "stopped");
  const from = c.mailboxIds.length ? mailboxes.filter((m) => c.mailboxIds.includes(m.id)).map((m) => m.email) : ["every mailbox switched on"];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/prospecting/campaigns" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{c.name}</h1>
        <CampaignStatusButtons id={c.id} status={c.status} />
        <CampaignDialog
          campaign={{ id: c.id, name: c.name, sequenceId: c.sequenceId, mailboxIds: c.mailboxIds }}
          sequences={sequences.map((s) => ({ id: s.id, name: s.name }))}
          mailboxes={mailboxes.map((m) => ({ id: m.id, name: m.email, enabled: m.enabled }))}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit campaign" title="Edit campaign">
              <Pencil />
            </Button>
          }
        />
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        Sequence{" "}
        <Link href={`/prospecting/sequences/${c.sequenceId}`} className="hover:underline">
          {c.sequenceName}
        </Link>{" "}
        · from {from.join(", ")}
        {c.startAt && c.startAt > new Date() && <> · starts {c.startAt.toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
        {c.brief && <> · {c.review ? "first emails wait in Review" : "first emails go out once written"}</>}
      </p>
      {c.brief && (
        <p className="px-1 text-xs whitespace-pre-line text-muted-foreground">
          <span className="text-foreground">What AI writes about:</span> {c.brief}
        </p>
      )}
      {n("writing", "active") > 0 && <RefreshWhile seconds={20} />}
      <StatStrip
        items={[
          ...(c.brief ? [{ label: "AI writing", value: n("writing") }] : []),
          { label: "Waiting for review", value: n("draft") },
          { label: "Emailing now", value: n("active", "paused") },
          { label: "Replied", value: n("replied"), hint: sent ? `${Math.round((n("replied") / sent) * 100)}% of those emailed` : undefined },
          { label: "Bounced or unsubscribed", value: n("bounced", "unsubscribed") },
        ]}
      />
      <Segmented
        items={FILTERS.map((f) => ({ href: f.key ? `/prospecting/campaigns/${id}?status=${f.key}` : `/prospecting/campaigns/${id}`, label: f.label, title: f.label, active: (status ?? "") === f.key }))}
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Prospect</TableHead>
              <TableHead>To / Cc</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Email</TableHead>
              <TableHead>Next</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="py-1.5 font-medium">
                  <Link href={`/prospecting/prospects/${e.companyId}`} className="hover:underline">
                    {e.companyName}
                  </Link>
                </TableCell>
                <TableCell className="max-w-80 py-1.5 text-xs">
                  <div className="truncate" title={e.personEmail}>
                    {e.personName && <>{e.personName} · </>}
                    {e.personEmail}
                  </div>
                  {e.ccEmails.length > 0 && <div className="truncate text-muted-foreground" title={e.ccEmails.join(", ")}>Cc {e.ccEmails.join(", ")}</div>}
                </TableCell>
                <TableCell className="max-w-72 py-1.5 text-xs">
                  {LABEL[e.status] ?? e.status}
                  {e.stopReason && <span className="text-muted-foreground"> · {e.stopReason}</span>}
                  {e.writeError && ["writing", "draft"].includes(e.status) && <div className="truncate text-amber-700 dark:text-amber-400" title={e.writeError}>{e.writeError}</div>}
                </TableCell>
                <TableCell className="py-1.5 text-right text-xs tabular-nums">{e.currentStep || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{e.status === "active" && e.nextSendAt ? e.nextSendAt.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell>
                <TableCell className="py-1.5">{["writing", "draft", "active", "paused"].includes(e.status) && <StopEnrollmentButton id={e.id} name={e.personName || e.companyName} />}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>{status ? "Nobody here." : "Nobody in this campaign yet. Tick prospects on the Prospects list and choose Add to campaign, or build a new campaign in the chat."}</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pager path={`/prospecting/campaigns/${id}`} params={sp} page={page} total={total} />
    </div>
  );
}
