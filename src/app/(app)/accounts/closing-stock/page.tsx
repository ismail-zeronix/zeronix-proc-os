import Link from "next/link";
import { ClosingStockForm } from "@/components/ledger-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { stockPosition } from "@/lib/ledger/data";
import { amount } from "@/lib/ledger/journal";
import { currentOrgId } from "@/lib/org";
import { longDay } from "@/lib/quotation";

export const metadata = { title: "Closing stock · Zeronix Accounts" };

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * The month-end stock count. Goods bought for a customer order move to cost of goods sold by themselves; goods bought
 * for stock stay in Inventory until someone says what the stock is worth. Then one entry corrects the difference.
 */
export default async function ClosingStockPage({ searchParams }: PageProps<"/accounts/closing-stock">) {
  await requireAccountant();
  const asked = (await searchParams).date;
  const date = isDay(asked) ? asked : dubaiToday();
  const { book, start, counts } = await stockPosition(await currentOrgId(), date);

  return (
    <div className="grid max-w-4xl gap-3">
      <PageToolbar title="Closing stock" meta="What the stock is worth at month end" />
      {start ? (
        <section className="grid gap-2 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Count or value the stock, then enter what it is worth. The difference from the books goes to cost of goods sold, so profit is right without tracking every item.
          </p>
          <ClosingStockForm date={date} book={book} today={dubaiToday()} />
        </section>
      ) : (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          The ledger is not switched on yet. Set the cut-over date in{" "}
          <Link href="/accounts/settings/opening" className="underline">
            Opening balances
          </Link>{" "}
          first.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Entry</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts.map((c) => (
              <TableRow key={c.id} className={c.reversedBy || c.isReversal ? "text-muted-foreground" : ""}>
                <TableCell className="py-1.5">
                  <Link href={`/accounts/journals/${c.id}`} className="font-mono text-sm font-medium hover:underline">
                    {c.number}
                  </Link>
                  <div className="text-xs text-muted-foreground">{longDay(c.date)}</div>
                </TableCell>
                <TableCell className="py-1.5">
                  {c.memo}
                  {c.reversedBy && (
                    <Badge variant="outline" className="ml-2">
                      Reversed by {c.reversedBy}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{amount(c.total)}</TableCell>
              </TableRow>
            ))}
            {!counts.length && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Empty>No stock counts yet.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
