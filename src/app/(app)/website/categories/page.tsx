import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { listCategories } from "@/lib/website/catalog";
import { StatusBadge } from "../status-badge";

export const metadata = { title: "Categories · Zeronix Website" };

export default async function CategoriesPage() {
  await requireApp("website");
  const rows = await listCategories();
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">Categories</h1>
        <span className="text-xs text-muted-foreground">Each one decides which specs its products show, compare and filter on</span>
        <Button size="sm" className="ml-auto" nativeButton={false} render={<Link href="/website/categories/new" />}>
          <Plus /> New category
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Web address</TableHead>
              <TableHead className="text-right">Spec fields</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/website/categories/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">/products/{r.slug}</TableCell>
                <TableCell className="text-right tabular-nums">{r.specTemplate.groups.reduce((n, g) => n + g.fields.length, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.products}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
