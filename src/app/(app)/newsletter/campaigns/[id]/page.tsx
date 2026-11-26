import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { PageToolbar } from "@/components/page-toolbar";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { campaignCounts, campaignSends, getCampaign } from "@/lib/newsletter/data";
import { contentOf } from "@/lib/newsletter/content";
import { templateName } from "@/lib/newsletter/templates";
import { CampaignEditor } from "../../campaign-editor";
import { DeleteNewsletterButton, DuplicateButton, PauseButton } from "../../campaign-controls";
import { editorContext } from "../../editor-data";

export const metadata = { title: "Newsletter · Zeronix Outreach" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "queued", label: "Waiting" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
] as const;
const STATUS: Record<string, string> = { draft: "Draft", sending: "Sending", paused: "Paused", done: "Finished" };
const SEND: Record<string, string> = { queued: "Waiting", sent: "Sent", failed: "Failed", skipped: "Skipped" };

export default async function CampaignPage({ params, searchParams }: PageProps<"/newsletter/campaigns/[id]">) {
  const { user } = await requireApp("newsletter");
  const { id: raw } = await params;
  const sp = await searchParams;
  const id = Number(raw);
  const c = Number.isInteger(id) ? await getCampaign(id) : null;
  if (!c) notFound();
  const content = contentOf(c);
  if (!content) notFound();

  if (c.status === "draft") {
    const ctx = await editorContext();
    return (
      <div className="grid gap-3">
        <PageToolbar title={c.name} meta={`Draft · ${templateName(c.templateKey)}`}>
          <BackButton fallback="/newsletter" />
          <DuplicateButton id={c.id} />
          <DeleteNewsletterButton id={c.id} name={c.name} />
        </PageToolbar>
        <CampaignEditor
          init={{ id: c.id, templateKey: c.templateKey, name: c.name, subject: c.subject, preheader: c.preheader, doc: content.doc ?? null, html: content.html ?? "", listId: c.listId }}
          lists={ctx.lists}
          brand={ctx.brand}
          logoSrc={ctx.logoSrc}
          userEmail={user.email}
          readyMailboxes={ctx.readyMailboxes}
        />
      </div>
    );
  }

  const status = FILTERS.find((f) => f.key === sp.status)?.key ?? "all";
  const page = pageParam(sp.page);
  const [counts, { rows, total }] = await Promise.all([campaignCounts(id), campaignSends(id, status, page, PAGE_SIZE)]);
  const base = `/newsletter/campaigns/${id}`;
  const all = counts.queued + counts.sent + counts.failed + counts.skipped;
  return (
    <div className="grid gap-3">
      <PageToolbar title={c.name} meta={`${STATUS[c.status]} · ${counts.sent} of ${all} sent${counts.queued ? ` · ${counts.queued} waiting` : ""}${counts.failed ? ` · ${counts.failed} failed` : ""}${counts.skipped ? ` · ${counts.skipped} skipped` : ""}`}>
        <BackButton fallback="/newsletter" />
        <Segmented items={FILTERS.map((f) => ({ href: f.key === "all" ? base : `${base}?status=${f.key}`, label: f.label, title: f.label, active: status === f.key }))} />
        {(c.status === "sending" || c.status === "paused") && <PauseButton id={c.id} paused={c.status === "paused"} />}
        <DuplicateButton id={c.id} />
        {c.status !== "sending" && <DeleteNewsletterButton id={c.id} name={c.name} />}
      </PageToolbar>
      <p className="text-xs text-muted-foreground">
        Subject: <span className="text-foreground">{c.subject}</span> · {templateName(c.templateKey)}
      </p>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="py-1.5 font-medium">
                  {s.email}
                  {s.name && <div className="text-xs font-normal text-muted-foreground">{s.name}</div>}
                </TableCell>
                <TableCell className="py-1.5 text-xs">{SEND[s.status]}</TableCell>
                <TableCell className="max-w-80 truncate py-1.5 text-xs">{s.skipReason || s.error || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{s.sentAt ? ago(s.sentAt) : "-"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Empty>Nothing here.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pager path={base} params={sp} page={page} total={total} />
    </div>
  );
}
