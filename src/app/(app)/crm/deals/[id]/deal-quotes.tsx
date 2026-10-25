import { FilePlus2, FileText, FolderKanban } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { Button } from "@/components/ui/button";
import { dayLabel } from "@/lib/dates";
import { ago } from "@/lib/format";
import { lineTotal, money } from "@/lib/quotation";
import type { QuoteSummary, quoteLines } from "@/lib/quotes-data";

type Line = Awaited<ReturnType<typeof quoteLines>>[number];

/**
 * The deal's Quotes tab: what was quoted, read only. Quotes are built and sent in Accounts › Quotes (products) or from the
 * BOQ in Projects (projects); this tab shows them and links there, so the selling side never edits prices.
 */
export function DealQuotes({
  dealId,
  quotes,
  lines,
  project,
  canAccounts,
  canProjects,
}: {
  dealId: number;
  quotes: QuoteSummary[];
  /** Lines of the newest quote. */
  lines: Line[];
  project: { id: number } | null;
  canAccounts: boolean;
  canProjects: boolean;
}) {
  const latest = quotes[0];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {project
            ? "A project is priced as a BOQ in the Projects app; the quote is made there."
            : "Quotes are made and sent in Accounts › Quotes, with Find price for supplier prices."}
        </p>
        {project
          ? canProjects && (
              <Button size="sm" variant="outline" nativeButton={false} render={<AppLink href={`/projects/list/${project.id}?tab=boq`} />}>
                <FolderKanban /> Open the BOQ
              </Button>
            )
          : canAccounts && (
              <Button size="sm" variant="outline" nativeButton={false} render={<AppLink href={`/accounts/quotes/new?deal=${dealId}`} />}>
                <FilePlus2 /> {latest ? "Edit the quote" : "Make quote"}
              </Button>
            )}
      </div>

      {quotes.length ? (
        <ul className="grid gap-0.5 rounded-lg border p-1">
          {quotes.map((q) => {
            const row = (
              <>
                <span className="font-mono font-medium">{q.number}</span>
                <QuoteStatusBadge status={q.shownStatus} />
                <span className="tabular-nums">{money(q.total)}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {q.sentAt ? `sent ${ago(q.sentAt)} · ` : ""}valid until {dayLabel(q.validUntil)}
                </span>
              </>
            );
            const cls = "flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-sm";
            return (
              <li key={q.id}>
                {canAccounts ? (
                  <AppLink href={`/accounts/quotes/${q.id}`} className={`${cls} hover:bg-muted`} title="Open the quote">
                    {row}
                  </AppLink>
                ) : (
                  <div className={cls}>{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <FileText className="size-4" /> No quote yet.
        </div>
      )}

      {latest && lines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            Lines of <span className="font-mono font-medium text-foreground">{latest.number}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-1.5 text-left font-medium">Description</th>
                <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                <th className="hidden px-3 py-1.5 text-right font-medium sm:table-cell">Price</th>
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    {l.section && <span className="mr-1.5 text-xs text-muted-foreground">{l.section} ·</span>}
                    {l.description}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.qty}</td>
                  <td className="hidden px-3 py-1.5 text-right tabular-nums sm:table-cell">{money(l.unitPrice)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(lineTotal(l))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-xs">
              <tr className="border-t">
                <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">
                  Subtotal {money(latest.subtotal)} · with VAT
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{money(latest.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
