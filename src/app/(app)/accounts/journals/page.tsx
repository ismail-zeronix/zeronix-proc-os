import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAccountant } from "@/lib/auth/session";
import { listJournals } from "@/lib/ledger/data";
import { amount, sourceLabel } from "@/lib/ledger/journal";
import { readList } from "@/lib/list-params";
import { currentOrgId } from "@/lib/org";
import { longDay } from "@/lib/quotation";

export const metadata = { title: "Journal entries · Zeronix Accounts" };

const VIEWS = [
  { key: "all", label: "All", title: "Every journal entry" },
  { key: "manual", label: "By hand", title: "Journals posted by an accountant" },
  { key: "auto", label: "From documents", title: "Posted by invoices, payments, bills and expenses" },
] as const;

const PATH = "/accounts/journals";

/** The day book: every journal entry, newest first. Each one opens to its lines. */
export default async function JournalsPage({ searchParams }: PageProps<"/accounts/journals">) {
  await requireAccountant();
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "all";
  const list = readList(sp, ["date", "number", "total"], { sort: "date", dir: "desc" });
  const { rows, total } = await listJournals(await currentOrgId(), { page: list.page, size: list.size, source: view, sort: list.sort as "date", dir: list.dir });
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;

  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Journal entries" meta={`${total} ${total === 1 ? "entry" : "entries"}`}>
        <Segmented items={VIEWS.map((v) => ({ href: v.key === "all" ? PATH : `${PATH}?view=${v.key}`, label: v.label, title: v.title, active: view === v.key }))} />
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/journals/new" />}>
          <Plus /> Journal
        </Button>
      </PageToolbar>
      <DataTable
        noun="entry"
        total={total}
        acrossPages={false}
        actions={<ExportActions list="journals" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={total} />}
        empty={view === "auto" ? "Invoices, payments, bills and expenses will post here once the ledger is switched on for them." : "No journals yet. Post one for accruals, corrections or money the owner puts in."}
        columns={[
          { label: head("Entry", "date") },
          { label: "What for" },
          { label: "From", className: "hidden md:table-cell" },
          { label: head("Amount", "total", "right"), className: "text-right" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/accounts/journals/${r.id}`,
          cells: [
            <>
              <Link href={`/accounts/journals/${r.id}`} className="font-mono text-sm font-medium hover:underline">
                {r.number}
              </Link>
              <div className="text-xs text-muted-foreground">{longDay(r.date)}</div>
            </>,
            <div key="m" className={`max-w-96 ${r.reversedByNumber ? "text-muted-foreground" : ""}`}>
              <div className="truncate" title={r.memo}>{r.memo || "-"}</div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {r.reversedByNumber && <Badge variant="outline">Reversed by {r.reversedByNumber}</Badge>}
                {r.reversalOfNumber && <Badge variant="outline">Reverses {r.reversalOfNumber}</Badge>}
              </div>
            </div>,
            <span key="s" className="text-xs">
              {sourceLabel(r.sourceType)}
              {r.createdByName && <div className="text-muted-foreground">{r.createdByName}</div>}
            </span>,
            <span key="a" className="font-medium tabular-nums">
              {amount(r.total)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
