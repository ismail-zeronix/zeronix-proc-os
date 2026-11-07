import { PageToolbar } from "@/components/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAccountant } from "@/lib/auth/session";
import { listTaxCodes } from "@/lib/ledger/data";
import { currentOrgId, orgProfile } from "@/lib/org";
import { regimeFor } from "@/lib/tax/regime";

export const metadata = { title: "Tax codes · Zeronix Accounts" };

/** The tax codes of the organisation's regime (UAE VAT), the return boxes they feed and the accounts their tax posts to. */
export default async function TaxCodesPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const [rows, org] = await Promise.all([listTaxCodes(orgId), orgProfile(orgId)]);
  const regime = regimeFor(org.taxRegime);
  const hint = new Map(regime.codes.map((c) => [c.code, c.hint]));
  const boxes = (b: string[]) => (b.length ? b.map((x) => `Box ${x}`).join(" + ") : "-");

  return (
    <div className="grid gap-3">
      <PageToolbar title="Tax codes" meta={`${regime.label} · ${regime.taxIdLabel} ${org.taxRegNo || "not set (Settings › VAT registration)"}`} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-16">Code</TableHead>
              <TableHead>Used for</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="hidden md:table-cell">On sales</TableHead>
              <TableHead className="hidden md:table-cell">On purchases</TableHead>
              <TableHead className="hidden lg:table-cell">Posts to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="py-1.5 font-mono font-semibold">{r.code}</TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    {r.label}
                    {r.selfAssessed && <Badge variant="outline" title="Nothing is charged on the document: we account for the tax ourselves and reclaim it">Self-assessed</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{hint.get(r.code)}</div>
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{r.ratePct}%</TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">{boxes(r.saleBoxes)}</TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">{boxes(r.purchaseBoxes)}</TableCell>
                <TableCell className="hidden py-1.5 text-xs lg:table-cell">
                  {r.salesAccount && <div>Sales: {r.salesAccount}</div>}
                  {r.purchaseAccount && <div>Purchases: {r.purchaseAccount}</div>}
                  {!r.salesAccount && !r.purchaseAccount && <span className="text-muted-foreground">No tax posted</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Box numbers are those of the FTA VAT 201 return. Standard-rated sales go in box 1 under the emirate of our establishment ({org.emirate.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}). Invoices and
        bills get a tax code per line in a later step; until then 5% documents count as SR and 0% as ZR.
      </p>
    </div>
  );
}
