import { Empty } from "@/components/stat-tile";
import { PageToolbar } from "@/components/page-toolbar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listSuppression } from "@/lib/prospecting/data";
import { RemoveSuppressionButton, SuppressionForm } from "../setup-ui";

export const metadata = { title: "Do not contact · Zeronix Prospecting" };

export default async function DoNotContactPage() {
  await requireApp("prospecting");
  const rows = await listSuppression();
  return (
    <div className="grid gap-3">
      <PageToolbar title="Do not contact" meta={`${rows.length} blocked · checked before every email`} />
      <section className="rounded-xl border bg-card p-3">
        <SuppressionForm />
        <p className="mt-2 text-xs text-muted-foreground">
          Unsubscribes and bounces are added here by themselves once sending starts. A domain blocks everyone at that company.
        </p>
      </section>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Email or domain</TableHead>
              <TableHead>Why</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="py-1.5 font-medium">
                  {r.value} <span className="text-xs font-normal text-muted-foreground">{r.kind === "domain" ? "whole domain" : ""}</span>
                </TableCell>
                <TableCell className="py-1.5 text-xs capitalize">{r.reason}</TableCell>
                <TableCell className="max-w-72 truncate py-1.5 text-xs">{r.note || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">
                  {ago(r.createdAt)}
                  {r.byName && ` · ${r.byName}`}
                </TableCell>
                <TableCell className="py-1.5">
                  <RemoveSuppressionButton id={r.id} value={r.value} />
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty>Nobody blocked yet.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
