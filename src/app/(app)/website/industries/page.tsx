import { ImageIcon, Plus } from "lucide-react";
import Link from "next/link";
import { Pager, PAGE_SIZE, pageParam } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { listIndustries } from "@/lib/website/catalog";
import { StatusBulkActions } from "../bulk-actions";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "../status-badge";
import { FillButton } from "./fill-button";
import { LIST_PAGE } from "@/components/list-page";

export const metadata = { title: "Industries · Zeronix Website" };

export default async function IndustriesPage({ searchParams }: PageProps<"/website/industries">) {
  const { user } = await requireApp("website");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const all = await listIndustries();
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div className={LIST_PAGE}>
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">Industries</h1>
        <span className="text-xs text-muted-foreground">Each has a hub page at /industries/slug and a column in the mega menu</span>
        <span className="ml-auto" />
        {user.role === "admin" && <FillButton />}
        <Button size="sm" nativeButton={false} render={<Link href="/website/industries/new" />}>
          <Plus /> New industry
        </Button>
      </div>
      <DataTable
        noun="industry"
        total={all.length}
        empty="No industries yet."
        actions={<StatusBulkActions list="industries" noun="industry" />}
        pager={<Pager path="/website/industries" params={sp} page={page} total={all.length} showSingle />}
        columns={[{ label: "Name" }, { label: "Web address" }, { label: "Products", className: "text-right" }, { label: "Picture" }, { label: "Status" }]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: [
            <Link key="n" href={`/website/industries/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </Link>,
            <span key="a" className="text-muted-foreground">
              /industries/{r.slug}
            </span>,
            <span key="p" className="tabular-nums">
              {r.products}
            </span>,
            r.hasImage ? (
              <ImageIcon key="i" className="size-4 text-emerald-600" aria-label="Has a picture" />
            ) : (
              <span key="i" className="text-xs text-muted-foreground">
                None
              </span>
            ),
            <StatusBadge key="s" status={r.status} />,
          ],
        }))}
      />
    </div>
  );
}
