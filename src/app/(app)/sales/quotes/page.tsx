import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { AppLink } from "@/components/app-link";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dayLabel } from "@/lib/dates";
import { money, QUOTE_STATUSES } from "@/lib/quotation";
import { listQuotes } from "@/lib/quotes-data";
import { aedShort } from "@/lib/sales";

export const metadata = { title: "Quotes · Zeronix Sales" };

const FILTERS = [{ key: "all", label: "All" }, ...QUOTE_STATUSES.map((s) => ({ key: s.key as string, label: s.label }))];

export default async function QuotesPage({ searchParams }: PageProps<"/sales/quotes">) {
  const access = await requireApp("sales");
  const crm = access.apps.includes("crm");
  const sp = await searchParams;
  const asked = String((Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? "all");
  const status = FILTERS.some((f) => f.key === asked) ? asked : "all";
  const all = await listQuotes(financeViewerOf(access));
  const count = (k: string) => (k === "all" ? all.length : all.filter((q) => q.shownStatus === k).length);
  const rows = status === "all" ? all : all.filter((q) => q.shownStatus === status);
  const waiting = all.filter((q) => q.shownStatus === "sent");
  const waitingValue = waiting.reduce((s, q) => s + q.subtotal, 0);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Quotes</h1>
        <Segmented
          items={FILTERS.map((f) => ({
            href: f.key === "all" ? "/sales/quotes" : `/sales/quotes?status=${f.key}`,
            label: `${f.label} ${count(f.key)}`,
            title: `Show ${f.label.toLowerCase()} quotes`,
            active: status === f.key,
          }))}
        />
        <span className="text-xs text-muted-foreground">
          {waiting.length ? `${waiting.length} waiting for an answer · ${aedShort(waitingValue)} before VAT` : "Nothing waiting for an answer"}
        </span>
        <Button size="sm" className="ml-auto" nativeButton={false} render={<Link href="/sales/quotes/new" />}>
          <FilePlus2 /> New quote
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <Empty>{all.length ? "No quotes with this status." : "No quotes yet. Press New quote, pick the deal, add the lines and press Make quote."}</Empty>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Quote</TableHead>
                  <TableHead>Customer and deal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Salesperson</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="py-1.5 font-mono font-medium">
                      <Link href={`/sales/quotes/${q.id}`} className="hover:underline">
                        {q.number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72 py-1.5">
                      <Link href={`/sales/customers/${q.companyId}`} className="font-medium hover:underline">
                        {q.companyName}
                      </Link>
                      {q.dealId && crm ? (
                        <AppLink href={`/crm/deals/${q.dealId}`} className="block truncate text-xs text-muted-foreground hover:underline">
                          {q.dealTitle}
                        </AppLink>
                      ) : (
                        <span className="block truncate text-xs text-muted-foreground">{q.dealTitle || "Instant quote"}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <QuoteStatusBadge status={q.shownStatus} />
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{money(q.total)}</TableCell>
                    <TableCell className="py-1.5">{dayLabel(q.validUntil)}</TableCell>
                    <TableCell className="py-1.5">
                      {q.createdByName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <UserAvatar name={q.createdByName} size={22} />
                          <span className="hidden truncate lg:inline">{q.createdByName}</span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:hidden">
            {rows.map((q) => (
              <li key={q.id}>
                <Link href={`/sales/quotes/${q.id}`} className="block rounded-lg border bg-card p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{q.number}</span>
                    <QuoteStatusBadge status={q.shownStatus} />
                    <span className="ml-auto text-sm font-medium tabular-nums">{money(q.total)}</span>
                  </div>
                  <div className="truncate text-sm">{q.companyName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {q.dealTitle || "Instant quote"} · valid until {dayLabel(q.validUntil)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
