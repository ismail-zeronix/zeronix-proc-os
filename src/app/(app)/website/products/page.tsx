import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listProducts } from "@/lib/website/catalog";
import { StatusBadge } from "../status-badge";
import { ProductUpload } from "./product-upload";

export const metadata = { title: "Products · Zeronix Website" };

export default async function ProductsPage({ searchParams }: PageProps<"/website/products">) {
  await requireApp("website");
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q) : "";
  const rows = await listProducts({ q: q || undefined });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Products</h1>
        <span className="text-xs text-muted-foreground">{rows.length} · upload a product .md from your research, or add one by hand</span>
        <form className="ml-auto">
          <input name="q" defaultValue={q} placeholder="Name or part number" className="h-8 w-56 rounded-md border bg-background px-2 text-sm" />
        </form>
        <ProductUpload />
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/website/products/new" />}>
          <Plus /> New product
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Part number</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Specs</TableHead>
              <TableHead className="text-right">Pictures</TableHead>
              <TableHead className="text-right">Industries</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No products yet. Upload a product .md (WEBSITE-PLAN.md section 6) or add one by hand.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/website/products/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.mpn}</TableCell>
                <TableCell>{r.brand ?? "—"}</TableCell>
                <TableCell>{r.category ?? <span className="text-amber-700">Pick one</span>}</TableCell>
                <TableCell className="text-right tabular-nums">{r.specs}</TableCell>
                <TableCell className="text-right tabular-nums">{r.images}</TableCell>
                <TableCell className="text-right tabular-nums">{r.industries}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{ago(r.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
