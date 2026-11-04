import { Plus } from "lucide-react";
import Link from "next/link";
import { Pager, PAGE_SIZE, pageParam } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { listCategories } from "@/lib/website/catalog";
import { StatusBulkActions } from "../bulk-actions";
import { FillButton } from "../industries/fill-button";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "../status-badge";
import { LIST_PAGE } from "@/components/list-page";

export const metadata = { title: "Categories · Zeronix Website" };

export default async function CategoriesPage({ searchParams }: PageProps<"/website/categories">) {
  const { user } = await requireApp("website");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const all = await listCategories();
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div className={LIST_PAGE}>
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">Categories</h1>
        <span className="text-xs text-muted-foreground">Each one decides which specs its products show, compare and filter on</span>
        <div className="ml-auto flex gap-2">
          {user.role === "admin" && <FillButton kind="category" />}
          <Button size="sm" nativeButton={false} render={<Link href="/website/categories/new" />}>
            <Plus /> New category
          </Button>
        </div>
      </div>
      <DataTable
        noun="category"
        total={all.length}
        empty="No categories yet."
        actions={<StatusBulkActions list="categories" noun="category" />}
        pager={<Pager path="/website/categories" params={sp} page={page} total={all.length} showSingle />}
        columns={[{ label: "Name" }, { label: "Web address" }, { label: "Spec fields", className: "text-right" }, { label: "Products", className: "text-right" }, { label: "Status" }]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: [
            <Link key="n" href={`/website/categories/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </Link>,
            <span key="a" className="text-muted-foreground">
              /products/{r.slug}
            </span>,
            <span key="f" className="tabular-nums">
              {r.specTemplate.groups.reduce((n, g) => n + g.fields.length, 0)}
            </span>,
            <span key="p" className="tabular-nums">
              {r.products}
            </span>,
            <StatusBadge key="s" status={r.status} />,
          ],
        }))}
      />
    </div>
  );
}
