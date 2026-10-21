import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { listCompanies } from "@/lib/sales-data";
import { CompanyDialog } from "./company-ui";

export const metadata = { title: "Companies · Zeronix Sales" };

export default async function CompaniesPage({ searchParams }: PageProps<"/sales/companies">) {
  await requireApp("sales");
  const sp = await searchParams;
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const rows = await listCompanies(q);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Companies</h1>
        <span className="text-xs text-muted-foreground">{rows.length} {q ? "match" : "in total"}</span>
        <form action="/sales/companies" className="relative ml-auto w-64 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search name, website, phone" className="h-8 pl-8" aria-label="Search companies" />
        </form>
        <CompanyDialog
          trigger={
            <Button variant="outline" size="icon-sm" aria-label="Add a company" title="Add a company">
              <Plus />
            </Button>
          }
        />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Company</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Emirate</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Open deals</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-1.5 font-medium">
                  <Link href={`/sales/companies/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="py-1.5">{c.industry || "-"}</TableCell>
                <TableCell className="py-1.5">{c.emirate || "-"}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{c.contacts}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{c.openDeals}</TableCell>
                <TableCell className="py-1.5">{c.ownerName || "-"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>{q ? "No company matches. Check the spelling, or add it with +." : "No companies yet. Add one with +, or start from an enquiry."}</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
