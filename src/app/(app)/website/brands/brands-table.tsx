"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BrandInput } from "@/lib/website/catalog";
import { saveBrandAction } from "../catalog-actions";
import { Field, StatusSelect, useLocal, useSave } from "../catalog-ui";
import { StatusBadge } from "../status-badge";

type Row = BrandInput & { id: number; products: number };
const blank: BrandInput = { slug: "", name: "", website: "", uaeWarrantyNote: "", sort: 0, status: "draft" };

/** Brands are small records, so they are edited in a dialog right on the list. */
export function BrandsTable({ rows }: { rows: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>UAE warranty</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10 text-right">
                <Button size="icon-sm" variant="ghost" aria-label="New brand" onClick={() => setEditing("new")}>
                  <Plus />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">{r.website}</TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">{r.uaeWarrantyNote}</TableCell>
                <TableCell className="text-right tabular-nums">{r.products}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New brand" : editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && <BrandForm key={editing === "new" ? "new" : editing.id} row={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BrandForm({ row, onDone }: { row?: Row; onDone: () => void }) {
  const [f, patch] = useLocal<BrandInput>(row ? { slug: row.slug, name: row.name, website: row.website, uaeWarrantyNote: row.uaeWarrantyNote, sort: row.sort, status: row.status } : blank);
  const [pending, save] = useSave("/website/brands", row?.id ?? -1);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(async () => {
          const res = await saveBrandAction(f, row?.id);
          if (res.error === undefined) onDone();
          return res;
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id="b-name" label="Name">
          <Input id="b-name" autoFocus value={f.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field id="b-slug" label="Web address">
          <Input id="b-slug" value={f.slug} placeholder="from the name" onChange={(e) => patch({ slug: e.target.value })} />
        </Field>
      </div>
      <Field id="b-web" label="Brand website (UAE)">
        <Input id="b-web" value={f.website} placeholder="https://www.hp.com/ae-en/" onChange={(e) => patch({ website: e.target.value })} />
      </Field>
      <Field id="b-war" label="UAE warranty note">
        <Input id="b-war" value={f.uaeWarrantyNote} placeholder="3 years Middle East, on-site next business day" onChange={(e) => patch({ uaeWarrantyNote: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="status" label="Status">
          <StatusSelect value={f.status} onChange={(status) => patch({ status })} />
        </Field>
        <Field id="b-sort" label="Order">
          <Input id="b-sort" type="number" min={0} value={f.sort} onChange={(e) => patch({ sort: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      <Button type="submit" pending={pending}>
        Save
      </Button>
    </form>
  );
}
