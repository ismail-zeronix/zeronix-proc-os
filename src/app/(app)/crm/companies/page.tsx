import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { LIST_PAGE } from "@/components/list-page";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { listCompanies } from "@/lib/sales-data";
import { CompanyBulkActions } from "../bulk-actions";
import { CompanyDialog } from "./company-ui";

export const metadata = { title: "Companies · Zeronix CRM" };

export default async function CompaniesPage({ searchParams }: PageProps<"/crm/companies">) {
  const access = await requireApp("crm");
  const sp = await searchParams;
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const page = pageParam(sp.page);
  const { rows, total } = await listCompanies(viewerOf(access), q, page, PAGE_SIZE);
  // deleting companies is admin only (as on the company page), so only admins get tick boxes
  const isAdmin = access.user.role === "admin";
  const columns = [
    { label: "Company", className: "py-1.5 font-medium" },
    { label: "Industry", className: "py-1.5" },
    { label: "Emirate", className: "py-1.5" },
    { label: "People", className: "py-1.5 text-right tabular-nums" },
    { label: "Open deals", className: "py-1.5 text-right tabular-nums" },
    { label: "Owner", className: "py-1.5" },
  ];
  const empty = q ? "No company matches. Check the spelling, or add it with +." : "No companies yet. Add one with +, or start from a new deal.";
  return (
    <div className={LIST_PAGE}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Companies</h1>
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString("en-US")} {q ? "match" : "in total"}
        </span>
        <form action="/crm/companies" className="relative ml-auto w-64 max-w-full">
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
      <DataTable
        noun="company"
        total={total}
        acrossPages={false}
        empty={empty}
        actions={isAdmin ? <CompanyBulkActions /> : undefined}
        selectable={isAdmin}
        pager={<Pager path="/crm/companies" params={sp} page={page} total={total} showSingle />}
        columns={columns}
        rows={rows.map((c) => ({
          id: c.id,
          cells: [
            <Link key="n" href={`/crm/companies/${c.id}`} className="hover:underline">
              {c.name}
            </Link>,
            c.industry || "-",
            c.emirate || "-",
            c.contacts,
            c.openDeals,
            c.ownerName || "-",
          ],
        }))}
      />
    </div>
  );
}
