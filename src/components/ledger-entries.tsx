import Link from "next/link";
import { documentEntries } from "@/lib/ledger/documents";
import { amount } from "@/lib/ledger/journal";
import { currentOrgId, withOrg } from "@/lib/org";

/**
 * For accountants on a document page: the journal entries the document (and its payments, credit note...) posted,
 * each linked to its lines. Nothing shows for documents from before the ledger started.
 */
export async function LedgerEntries({ refs }: { refs: { sourceType: string; sourceId: number }[] }) {
  const orgId = await currentOrgId();
  const rows = await withOrg(orgId, (tx) => documentEntries(tx, orgId, refs));
  return (
    <section className="grid gap-1 rounded-xl border bg-card p-3 text-sm">
      <h2 className="text-xs font-semibold text-muted-foreground">Ledger</h2>
      {rows.length ? (
        <ul className="grid gap-0.5">
          {rows.map((r) => (
            <li key={r.id} className={`flex items-center justify-between gap-2 ${r.reversedBy || r.isReversal ? "text-muted-foreground" : ""}`}>
              <Link href={`/accounts/journals/${r.id}`} className="font-mono text-xs hover:underline">
                {r.number}
              </Link>
              <span className="min-w-0 flex-1 truncate text-xs">
                {r.isReversal ? "reversal" : r.purpose.startsWith("cogs") ? "cost of goods sold" : ""}
                {r.reversedBy ? ` reversed by ${r.reversedBy}` : ""}
              </span>
              <span className="text-xs tabular-nums">{amount(r.total)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Not in the ledger (before the cut-over, or the ledger is not switched on yet).</p>
      )}
    </section>
  );
}
