import { Trophy } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Trend } from "@/components/trend";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { priceMoves, quietSuppliers } from "@/lib/alerts";
import { requireApp } from "@/lib/auth/session";
import { ago, money } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata = { title: "Price alerts · Zeronix" };

const TABS = [
  { key: "drops", label: "Price drops" },
  { key: "rises", label: "Price rises" },
  { key: "quiet", label: "Quiet suppliers" },
] as const;
const RANGES = [7, 14, 30, 90];

export default async function AlertsPage({ searchParams }: PageProps<"/procurement/alerts">) {
  await requireApp("procurement");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "drops";
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 7;
  const staleDays = Number(await getSetting("stale_days")) || 14;

  const [moves, quiet] = await Promise.all([priceMoves({ withinDays: days, staleDays }), quietSuppliers(staleDays)]);
  const drops = moves.filter((m) => m.changePct < 0).sort((a, b) => Number(b.isBest) - Number(a.isBest) || a.changePct - b.changePct);
  const rises = moves.filter((m) => m.changePct > 0).sort((a, b) => b.changePct - a.changePct);
  const counts = { drops: drops.length, rises: rises.length, quiet: quiet.length };
  const href = (t: string, d = days) => `/procurement/alerts?tab=${t}&days=${d}`;

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Price alerts"
        description="Changes between a supplier's last two quotes of the same product, and suppliers that stopped sending lists."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="ml-1 text-xs text-muted-foreground tabular-nums">{counts[t.key]}</span>
            </Link>
          ))}
        </div>
        {tab !== "quiet" && (
          <div className="flex items-center gap-1 text-sm">
            <span className="mr-1 text-muted-foreground">Quotes from the last</span>
            {RANGES.map((d) => (
              <Link
                key={d}
                href={href(tab, d)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  d === days ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
                )}
              >
                {d} days
              </Link>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent>
          {tab === "quiet" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Last saved list</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quiet.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link href={`/procurement/suppliers/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {s.lastList ? `${s.daysSince} days ago (${ago(s.lastList)})` : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
                {!quiet.length && <EmptyRow cols={2}>Every active supplier sent a list in the last {staleDays} days.</EmptyRow>}
              </TableBody>
            </Table>
          ) : (
            <MovesTable rows={tab === "drops" ? drops : rises} days={days} kind={tab} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MovesTable({ rows, days, kind }: { rows: Awaited<ReturnType<typeof priceMoves>>; days: number; kind: "drops" | "rises" }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead className="text-right">Was</TableHead>
          <TableHead className="text-right">Now</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right">Quoted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((m) => (
          <TableRow key={`${m.productId}-${m.supplierId}`}>
            <TableCell className="max-w-[320px]">
              <Link href={`/procurement/products/${m.productId}`} className="block truncate font-medium hover:underline">
                {m.label}
              </Link>
              {m.isBest && kind === "drops" && (
                <Badge variant="secondary" className="mt-0.5">
                  <Trophy /> now the cheapest of {m.suppliers} suppliers
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <Link href={`/procurement/suppliers/${m.supplierId}`} className="hover:underline">
                {m.supplierName}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{money(m.prevPrice, m.currency)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{money(m.price, m.currency)}</TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end">
                <Trend price={m.price} prevPrice={m.prevPrice} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {m.price < m.prevPrice ? "−" : "+"}
                  {Math.abs(m.price - m.prevPrice).toLocaleString("en-US")}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right text-xs whitespace-nowrap">
              <Link href={`/procurement/import/${m.priceListId}`} className="hover:underline">
                {ago(m.receivedAt)}
              </Link>
            </TableCell>
          </TableRow>
        ))}
        {!rows.length && <EmptyRow cols={6}>No price {kind === "drops" ? "drops" : "rises"} in the last {days} days.</EmptyRow>}
      </TableBody>
    </Table>
  );
}

function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}
