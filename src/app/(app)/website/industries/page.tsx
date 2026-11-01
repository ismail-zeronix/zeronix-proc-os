import { ImageIcon, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { listIndustries } from "@/lib/website/catalog";
import { StatusBadge } from "../status-badge";
import { FillButton } from "./fill-button";

export const metadata = { title: "Industries · Zeronix Website" };

export default async function IndustriesPage() {
  const { user } = await requireApp("website");
  const rows = await listIndustries();
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">Industries</h1>
        <span className="text-xs text-muted-foreground">{rows.length} · each has a hub page at /industries/slug and a column in the mega menu</span>
        <span className="ml-auto" />
        {user.role === "admin" && <FillButton />}
        <Button size="sm" nativeButton={false} render={<Link href="/website/industries/new" />}>
          <Plus /> New industry
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Web address</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead>Picture</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/website/industries/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">/industries/{r.slug}</TableCell>
                <TableCell className="text-right tabular-nums">{r.products}</TableCell>
                <TableCell>{r.hasImage ? <ImageIcon className="size-4 text-emerald-600" aria-label="Has a picture" /> : <span className="text-xs text-muted-foreground">None</span>}</TableCell>
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
