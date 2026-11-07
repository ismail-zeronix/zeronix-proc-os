import { Lock } from "lucide-react";
import { AccountDialog } from "@/components/ledger-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAccountant } from "@/lib/auth/session";
import { ACCOUNT_TYPES, accountTypeLabel } from "@/lib/ledger/coa-templates";
import { chartOfAccounts } from "@/lib/ledger/data";
import { amount } from "@/lib/ledger/journal";
import { currentOrgId } from "@/lib/org";

export const metadata = { title: "Chart of accounts · Zeronix Accounts" };

/**
 * Every account in code order, as a tree: groups add up the accounts under them. Balances are shown on each account's
 * natural side (assets and expenses as debits, the rest as credits); a figure in brackets is on the other side.
 */
export default async function ChartPage({ searchParams }: PageProps<"/accounts/chart">) {
  await requireAccountant();
  const sp = await searchParams;
  const type = ACCOUNT_TYPES.some((t) => t.key === sp.type) ? (sp.type as string) : "";
  const showOff = sp.off === "1";
  const all = await chartOfAccounts(await currentOrgId());
  const rows = all.filter((r) => (!type || r.type === type) && (showOff || r.isActive));
  const groups = all.filter((r) => r.isGroup).map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type }));
  const href = (t: string, off = showOff) => {
    const q = new URLSearchParams();
    if (t) q.set("type", t);
    if (off) q.set("off", "1");
    const s = q.toString();
    return `/accounts/chart${s ? `?${s}` : ""}`;
  };
  const off = all.filter((r) => !r.isActive).length;

  return (
    <div className="grid gap-3">
      <PageToolbar title="Chart of accounts" meta={`${all.filter((r) => !r.isGroup).length} accounts in ${groups.length} groups`}>
        <Segmented
          items={[{ key: "", plural: "All" }, ...ACCOUNT_TYPES].map((t) => ({ href: href(t.key), label: t.plural, title: `Show ${t.plural.toLowerCase()}`, active: type === t.key }))}
        />
        {off > 0 && (
          <Segmented items={[{ href: href(type, !showOff), label: showOff ? `Hide ${off} not in use` : `Show ${off} not in use`, title: "Accounts switched off", active: showOff }]} />
        )}
        <AccountDialog groups={groups} />
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-20">Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Edit</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={`${r.isGroup ? "bg-muted/40 font-semibold" : ""} ${r.isActive ? "" : "text-muted-foreground"}`}>
                <TableCell className="py-1.5 font-mono text-xs">{r.code}</TableCell>
                <TableCell className="py-1.5">
                  <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${(type ? 0 : r.depth) * 1.1}rem` }}>
                    <span className="truncate">{r.name}</span>
                    {r.systemKey && (
                      <span title="The portal posts to this account by itself" className="text-muted-foreground">
                        <Lock className="size-3" aria-label="Used by the portal" />
                      </span>
                    )}
                    {!r.isActive && <Badge variant="outline">Not in use</Badge>}
                  </div>
                  {r.description && !r.isGroup && <div className="truncate text-xs font-normal text-muted-foreground" style={{ paddingLeft: `${(type ? 0 : r.depth) * 1.1}rem` }}>{r.description}</div>}
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">{accountTypeLabel(r.type)}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {r.lines === 0 && !r.isGroup ? (
                    <span className="text-muted-foreground">-</span>
                  ) : r.natural < 0 ? (
                    <span title="On the other side than usual for this kind of account">({amount(-r.natural)})</span>
                  ) : (
                    amount(r.natural)
                  )}
                </TableCell>
                <TableCell className="py-1.5">
                  <AccountDialog account={r} groups={groups} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Balances are on each account&apos;s usual side: assets and expenses as debits, liabilities, equity and income as credits. Accounts with a lock are the
        ones invoices, payments, bills and expenses post to by themselves.
      </p>
    </div>
  );
}
