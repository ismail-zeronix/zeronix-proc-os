import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { ReverseJournalDialog } from "@/components/ledger-ui";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { getJournal } from "@/lib/ledger/data";
import { amount, MANUAL_SOURCES, sourceHref, sourceLabel } from "@/lib/ledger/journal";
import { currentOrgId } from "@/lib/org";
import { longDay } from "@/lib/quotation";

export async function generateMetadata({ params }: PageProps<"/accounts/journals/[id]">) {
  await requireFinance();
  const j = await getJournal(await currentOrgId(), Number((await params).id)).catch(() => null);
  return { title: `${j?.number ?? "Journal"} · Zeronix Accounts` };
}

/** One journal entry: its lines, where it came from, and what reversed it. Anyone in Accounts can read it (reports open it); only accountants reverse. */
export default async function JournalPage({ params }: PageProps<"/accounts/journals/[id]">) {
  const access = await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const j = await getJournal(await currentOrgId(), id);
  if (!j) notFound();
  const src = sourceHref(j.sourceType, j.sourceId);
  const canReverse = access.accountant && MANUAL_SOURCES.has(j.sourceType) && !j.reversedBy && !j.reversalOf;
  const hasTax = j.lines.some((l) => l.taxCode);
  const hasParty = j.lines.some((l) => l.partyName);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/accounts/journals" />
        <h1 className="font-mono text-lg font-semibold tracking-tight">{j.number}</h1>
        {j.reversedBy && (
          <Badge variant="outline">
            Reversed by{" "}
            <Link href={`/accounts/journals/${j.reversedBy.id}`} className="ml-1 font-mono hover:underline">
              {j.reversedBy.number}
            </Link>
          </Badge>
        )}
        {j.reversalOf && (
          <Badge variant="outline">
            Reverses{" "}
            <Link href={`/accounts/journals/${j.reversalOf.id}`} className="ml-1 font-mono hover:underline">
              {j.reversalOf.number}
            </Link>
          </Badge>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {longDay(j.date)} · {sourceLabel(j.sourceType)}
          {src && (
            <>
              {" · "}
              <Link href={src} className="hover:underline">
                open the document
              </Link>
            </>
          )}
        </span>
        {canReverse && <ReverseJournalDialog id={j.id} number={j.number} date={j.date} today={dubaiToday()} />}
      </div>
      <p className="text-sm">{j.memo}</p>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Account</TableHead>
              <TableHead className="hidden sm:table-cell">Note</TableHead>
              {hasParty && <TableHead className="hidden md:table-cell">Customer / supplier</TableHead>}
              {hasTax && <TableHead className="hidden md:table-cell">Tax</TableHead>}
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {j.lines.map((l) => (
              <TableRow key={l.lineNo}>
                <TableCell className="py-1.5">
                  <span className="font-mono text-xs text-muted-foreground">{l.accountCode}</span> {l.accountName}
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs text-muted-foreground sm:table-cell">{l.description || "-"}</TableCell>
                {hasParty && <TableCell className="hidden py-1.5 text-xs md:table-cell">{l.partyName ?? "-"}</TableCell>}
                {hasTax && (
                  <TableCell className="hidden py-1.5 text-xs md:table-cell">
                    {l.taxCode ? `${l.taxCode}${l.taxBase != null ? ` on ${amount(l.taxBase)}` : ""}` : "-"}
                  </TableCell>
                )}
                <TableCell className="py-1.5 text-right tabular-nums">{l.debit ? amount(l.debit) : ""}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{l.credit ? amount(l.credit) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell colSpan={1 + 1 + (hasParty ? 1 : 0) + (hasTax ? 1 : 0)} className="py-2">
                Total {j.currency}
              </TableCell>
              <TableCell className="py-2 text-right tabular-nums">{amount(j.total)}</TableCell>
              <TableCell className="py-2 text-right tabular-nums">{amount(j.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Posted {j.createdByName ? `by ${j.createdByName} ` : ""}on {j.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}.
        {MANUAL_SOURCES.has(j.sourceType) ? " Posted entries are never edited: reverse this one and post a new journal to correct it." : " To undo it, void or cancel the document that posted it."}
      </p>
    </div>
  );
}
