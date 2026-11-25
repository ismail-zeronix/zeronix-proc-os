import { Pencil, UserPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { PageToolbar } from "@/components/page-toolbar";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { getList, listContacts, listLists, type ContactStatus } from "@/lib/newsletter/data";
import { AddEmailsDialog, DeleteListButton, ListDialog, RemoveContactButton } from "../../audience-ui";

export const metadata = { title: "List · Zeronix Outreach" };

const FILTERS: { key: ContactStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Can receive" },
  { key: "unsubscribed", label: "Unsubscribed" },
  { key: "bounced", label: "Bounced" },
];
const STATUS: Record<ContactStatus, string> = { active: "Can receive", unsubscribed: "Unsubscribed", bounced: "Bounced" };

export default async function ListPage({ params, searchParams }: PageProps<"/newsletter/audiences/[id]">) {
  await requireApp("newsletter");
  const { id: raw } = await params;
  const sp = await searchParams;
  const id = Number(raw);
  const list = Number.isInteger(id) ? await getList(id) : null;
  if (!list) notFound();
  const status = FILTERS.find((f) => f.key === sp.status)?.key ?? "all";
  const page = pageParam(sp.page);
  const [{ rows, total }, all] = await Promise.all([listContacts(id, status, page, PAGE_SIZE), listLists()]);
  const stats = all.find((l) => l.id === id);
  const base = `/newsletter/audiences/${id}`;
  return (
    <div className="grid gap-3">
      <PageToolbar title={list.name} meta={`${stats?.active ?? 0} can receive · ${stats?.unsubscribed ?? 0} unsubscribed · ${stats?.bounced ?? 0} bounced`}>
        <BackButton fallback="/newsletter/audiences" />
        <Segmented items={FILTERS.map((f) => ({ href: f.key === "all" ? base : `${base}?status=${f.key}`, label: f.label, title: f.label, active: status === f.key }))} />
        <ListDialog
          list={{ id: list.id, name: list.name, consentNote: list.consentNote }}
          trigger={
            <Button variant="outline" size="icon-sm" aria-label="Edit list" title="Edit list">
              <Pencil />
            </Button>
          }
        />
        <DeleteListButton id={list.id} name={list.name} />
        <AddEmailsDialog
          listId={list.id}
          trigger={
            <Button size="sm">
              <UserPlus /> Add emails
            </Button>
          }
        />
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-1.5 font-medium">
                  {c.email}
                  {c.name && <div className="text-xs font-normal text-muted-foreground">{c.name}</div>}
                </TableCell>
                <TableCell className="py-1.5 text-xs">{c.company || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs">{STATUS[c.status]}</TableCell>
                <TableCell className="max-w-56 truncate py-1.5 text-xs">{c.source || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{ago(c.createdAt)}</TableCell>
                <TableCell className="py-1.5">
                  <RemoveContactButton id={c.id} email={c.email} />
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>{status === "all" ? "Nobody in this list yet. Press Add emails and paste the addresses." : "Nobody here."}</Empty>
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
