import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatform } from "@/platform/session";
import { listTenants, platformHealth } from "@/platform/tenants";

const size = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }) : "never");

export default async function PlatformHome() {
  await requirePlatform();
  const [tenants, health] = await Promise.all([listTenants(), platformHealth()]);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Organisations", `${health.orgs}${health.paused ? ` (${health.paused} paused)` : ""}`],
          ["Errors, last 24 h", String(health.errors)],
          ["Downloads waiting", String(health.exports_waiting)],
          ["Downloads failed, 24 h", String(health.exports_failed)],
        ].map(([label, value]) => (
          <Card key={label} className="gap-1 py-3">
            <CardContent className="px-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Organisations</CardTitle>
          <Link href="/platform/new" className="text-sm font-medium hover:underline">
            + New organisation
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="text-right">Quotes</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{t.id}</TableCell>
                  <TableCell>
                    <Link href={`/platform/tenants/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell>{t.status === "active" ? <Badge variant="secondary">Active</Badge> : <Badge variant="destructive">Paused</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.users}
                    {t.user_limit ? ` / ${t.user_limit}` : ""}
                  </TableCell>
                  <TableCell>{day(t.last_login)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.quotes}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.invoices}</TableCell>
                  <TableCell className="text-right tabular-nums">{size(t.storage)}</TableCell>
                  <TableCell>{day(t.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
