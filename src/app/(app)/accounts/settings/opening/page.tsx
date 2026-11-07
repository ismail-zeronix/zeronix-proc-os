import { eq } from "drizzle-orm";
import Link from "next/link";
import { schema } from "@/db";
import { BackfillCard, CutoverForm, TrialBalanceImport } from "@/components/opening-ledger-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAccountant } from "@/lib/auth/session";
import { postableAccounts } from "@/lib/ledger/data";
import { ledgerInUse, ledgerStart } from "@/lib/ledger/documents";
import { amount } from "@/lib/ledger/journal";
import { ledgerChecks, openingEntry } from "@/lib/ledger/opening-data";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, withOrg } from "@/lib/org";
import { addDays, longDay } from "@/lib/quotation";

export const metadata = { title: "Opening balances · Zeronix Accounts" };

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>{done ? "✓" : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Switching the ledger on: the cut-over date, the opening balances from Zoho's trial balance, the portal documents
 * since then, and the checks that show the ledger agrees with the documents.
 */
export default async function OpeningPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const { start, opening, posted, keys } = await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const keys = await tx
      .select({ id: schema.ledgerAccounts.id, key: schema.ledgerAccounts.systemKey })
      .from(schema.ledgerAccounts)
      .where(eq(schema.ledgerAccounts.organizationId, orgId));
    return { start: await ledgerStart(tx, orgId), opening: await openingEntry(tx, orgId), posted: await ledgerInUse(tx, orgId), keys };
  });
  const [accounts, { checks }] = await Promise.all([postableAccounts(orgId), ledgerChecks(orgId)]);
  const idOf = (k: string) => keys.find((x) => x.key === k)?.id ?? 0;

  return (
    <div className="grid max-w-5xl gap-3">
      <PageToolbar title="Opening balances" meta={start ? `Ledger from ${longDay(start)}` : "Ledger not switched on yet"} />

      <Step n={1} title="Cut-over date" done={!!start}>
        <p className="text-sm text-muted-foreground">
          The day the portal&apos;s ledger takes over from Zoho. Invoices, payments, bills and expenses from that day on post here by themselves; everything
          before it comes in as one opening entry from Zoho&apos;s trial balance. The start of a VAT quarter is the cleanest choice.
        </p>
        <CutoverForm value={start} locked={posted} />
        {posted && <p className="text-xs text-muted-foreground">Locked: the ledger already holds opening balances or documents.</p>}
      </Step>

      <Step n={2} title="Opening balances from Zoho" done={!!opening}>
        {!start ? (
          <p className="text-sm text-muted-foreground">Set the cut-over date first.</p>
        ) : opening ? (
          <p className="text-sm">
            Posted as{" "}
            <Link href={`/accounts/journals/${opening.id}`} className="font-mono font-medium hover:underline">
              {opening.number}
            </Link>{" "}
            on {longDay(opening.date)} ({amount(opening.total)} each side). To change it, reverse that entry from its page and import again.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Balances on {longDay(addDays(start, -1))}. Receivables and payables are split per customer and supplier from the open invoices and bills in the
              portal, so statements and ageing work from day one.
            </p>
            <TrialBalanceImport accounts={accounts} arId={idOf("ar")} apId={idOf("ap")} />
          </>
        )}
      </Step>

      <Step n={3} title="Documents since the cut-over">
        {start ? (
          <>
            <p className="text-sm text-muted-foreground">
              New documents post as they are saved. Documents already in the portal from {longDay(start)} on are posted here, oldest first; anything already in
              the ledger is skipped, so this is safe to run again.
            </p>
            <BackfillCard />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Set the cut-over date first.</p>
        )}
      </Step>

      {checks.length > 0 && (
        <Step n={4} title="Does the ledger agree with the documents?" done={checks.every((c) => c.difference === 0)}>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Check</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                  <TableHead className="text-right">Ledger</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => (
                  <TableRow key={c.label}>
                    <TableCell className="py-1.5">
                      {c.label}
                      <div className="text-xs text-muted-foreground">{c.hint}</div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{amount(c.documents)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{amount(c.ledger)}</TableCell>
                    <TableCell className={`py-1.5 text-right font-medium tabular-nums ${c.difference ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {c.difference ? amount(c.difference) : "Matches"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            A difference on receivables or payables is usually a Zoho balance with no open document in the portal (or the other way round). Reports switch to
            the ledger once all four match.
          </p>
        </Step>
      )}
    </div>
  );
}
