import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { AppLink } from "@/components/app-link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { Access } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dayLabel } from "@/lib/dates";
import { pageOf, readList, sortRows } from "@/lib/list-params";
import { money, QUOTE_STATUSES } from "@/lib/quotation";
import { listQuotes } from "@/lib/quotes-data";
import { aedShort } from "@/lib/sales";
import { param, type SalesBase } from "@/lib/sales-base";

const FILTERS = [{ key: "all", label: "All" }, ...QUOTE_STATUSES.map((s) => ({ key: s.key as string, label: s.label }))];

export async function QuotesView({ access, base, searchParams }: { access: Access; base: SalesBase; searchParams: Record<string, string | string[] | undefined> }) {
  const crm = access.apps.includes("crm");
  const asked = String(param(searchParams.status) ?? "all");
  const status = FILTERS.some((f) => f.key === asked) ? asked : "all";
  const all = await listQuotes(financeViewerOf(access));
  const count = (k: string) => (k === "all" ? all.length : all.filter((q) => q.shownStatus === k).length);
  const rows = status === "all" ? all : all.filter((q) => q.shownStatus === status);
  const path = `${base}/quotes`;
  const list = readList(searchParams, ["date", "customer", "total", "valid"], { sort: "date", dir: "desc" });
  const shown = pageOf(list.sort === "date" && list.dir === "desc" ? rows : sortRows(rows, { date: (q) => q.id, customer: (q) => q.companyName, total: (q) => q.total, valid: (q) => q.validUntil }, list), list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={path} sp={searchParams} list={list} align={align} />;
  const waiting = all.filter((q) => q.shownStatus === "sent");
  const waitingValue = waiting.reduce((s, q) => s + q.subtotal, 0);

  return (
    <div className={LIST_PAGE}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Quotes</h1>
        <Segmented
          items={FILTERS.map((f) => ({
            href: f.key === "all" ? `${base}/quotes` : `${base}/quotes?status=${f.key}`,
            label: `${f.label} ${count(f.key)}`,
            title: `Show ${f.label.toLowerCase()} quotes`,
            active: status === f.key,
          }))}
        />
        <span className="text-xs text-muted-foreground">
          {waiting.length ? `${waiting.length} waiting for an answer · ${aedShort(waitingValue)} before VAT` : "Nothing waiting for an answer"}
        </span>
        <Button size="sm" className="ml-auto" nativeButton={false} render={<Link href={`${base}/quotes/new`} />}>
          <FilePlus2 /> New quote
        </Button>
      </div>

      <DataTable
        noun="quote"
        total={rows.length}
        acrossPages={false}
        selectable={access.finance}
        actions={<ExportActions list="quotes" />}
        pager={<ListPager path={path} sp={searchParams} list={list} total={rows.length} />}
        empty={all.length ? "No quotes with this status." : "No quotes yet. Press New quote, pick the customer, add the lines and press Make quote."}
        columns={[
          { label: head("Quote", "date") },
          { label: head("Customer and deal", "customer") },
          { label: "Status" },
          { label: head("Total", "total", "right"), className: "text-right" },
          { label: head("Valid until", "valid"), className: "hidden sm:table-cell" },
          { label: "Salesperson", className: "hidden md:table-cell" },
        ]}
        rows={shown.map((q) => ({
          id: q.id,
          cells: [
            <Link key="n" href={`${base}/quotes/${q.id}`} className="font-mono font-medium hover:underline">
              {q.number}
            </Link>,
            <div key="c" className="max-w-72">
              <Link href={`${base}/customers/${q.companyId}`} className="font-medium hover:underline">
                {q.companyName}
              </Link>
              {q.dealId && crm ? (
                <AppLink href={`/crm/deals/${q.dealId}`} className="block truncate text-xs text-muted-foreground hover:underline">
                  {q.dealTitle}
                </AppLink>
              ) : (
                <span className="block truncate text-xs text-muted-foreground">{q.dealTitle || "Instant quote"}</span>
              )}
            </div>,
            <QuoteStatusBadge key="s" status={q.shownStatus} />,
            <span key="t" className="tabular-nums">
              {money(q.total)}
            </span>,
            dayLabel(q.validUntil),
            q.createdByName ? (
              <span key="u" className="inline-flex items-center gap-1.5">
                <UserAvatar name={q.createdByName} size={22} />
                <span className="hidden truncate lg:inline">{q.createdByName}</span>
              </span>
            ) : (
              "-"
            ),
          ],
        }))}
      />
    </div>
  );
}
