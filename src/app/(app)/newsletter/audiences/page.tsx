import { Plus } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listLists } from "@/lib/newsletter/data";
import { ListDialog } from "../audience-ui";

export const metadata = { title: "Audiences · Zeronix Outreach" };

export default async function AudiencesPage() {
  await requireApp("newsletter");
  const lists = await listLists();
  return (
    <div className="grid gap-3">
      <PageToolbar title="Audiences" meta={`${lists.length} list${lists.length === 1 ? "" : "s"}`}>
        <ListDialog
          trigger={
            <Button size="sm">
              <Plus /> New list
            </Button>
          }
        />
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>List</TableHead>
              <TableHead className="text-right">Can receive</TableHead>
              <TableHead className="text-right">Unsubscribed</TableHead>
              <TableHead className="text-right">Bounced</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lists.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="py-1.5 font-medium">
                  <Link href={`/newsletter/audiences/${l.id}`} className="hover:underline">
                    {l.name}
                  </Link>
                  {l.consentNote && <div className="max-w-md truncate text-xs font-normal text-muted-foreground">{l.consentNote}</div>}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{l.active}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{l.unsubscribed}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{l.bounced}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{ago(l.createdAt)}</TableCell>
              </TableRow>
            ))}
            {!lists.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty>No lists yet. Press New list, then paste the emails you want to write to.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
