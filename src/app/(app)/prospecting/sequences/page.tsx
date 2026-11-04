import { Plus } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listSegments } from "@/lib/prospecting/data";
import { listSequences } from "@/lib/prospecting/outreach";

export const metadata = { title: "Sequences · Zeronix Prospecting" };

export default async function SequencesPage() {
  await requireApp("prospecting");
  const [rows, segments] = await Promise.all([listSequences(), listSegments()]);
  const seg = new Map(segments.map((s) => [s.key, s.label]));
  return (
    <div className="grid gap-3">
      <PageToolbar title="Sequences" meta="The emails a campaign sends: a first email, then follow-ups in the same thread until they reply">
        <Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href="/prospecting/sequences/new" />} aria-label="New sequence" title="New sequence">
          <Plus />
        </Button>
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Sequence</TableHead>
              <TableHead>Written for</TableHead>
              <TableHead className="text-right">Emails</TableHead>
              <TableHead className="text-right">Over</TableHead>
              <TableHead className="text-right">Campaigns</TableHead>
              <TableHead>Changed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="py-1.5 font-medium">
                  <Link href={`/prospecting/sequences/${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell className="py-1.5 text-xs">{(s.segmentKey && seg.get(s.segmentKey)) || "Any segment"}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{s.steps}</TableCell>
                <TableCell className="py-1.5 text-right text-xs tabular-nums">{s.days} working days</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{s.campaigns}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{ago(s.updatedAt)}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>No sequences yet. Add one with +.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
