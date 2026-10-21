import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
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
    <div className="grid gap-5">
      <PageHeader
        title="Companies"
        description={`${rows.length} ${q ? "match" : "in the system"}`}
        actions={
          <CompanyDialog
            trigger={
              <Button>
                <Plus /> Add company
              </Button>
            }
          />
        }
      />
      <form action="/sales/companies" className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Search by name, website or phone" className="pl-8" aria-label="Search companies" />
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell className="font-medium">
                  <Link href={`/sales/companies/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{c.industry || "-"}</TableCell>
                <TableCell>{c.emirate || "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.contacts}</TableCell>
                <TableCell className="text-right tabular-nums">{c.openDeals}</TableCell>
                <TableCell>{c.ownerName || "-"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>{q ? "No company matches. Check the spelling, or add it." : "No companies yet. Add one, or start from a new enquiry."}</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
