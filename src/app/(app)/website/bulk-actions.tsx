"use client";

import { Archive, Eye, EyeOff, MessageSquareQuote, Search, ShoppingCart, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Result } from "@/lib/prospecting/result";
import type { ProductBulkOp, ProductFilter } from "@/lib/website/catalog";
import { bulkProductsAction, bulkStatusAction } from "./catalog-actions";
import { bulkPostStatusAction } from "./content-actions";
import { useSelection } from "@/components/data-table";

/** Runs one bulk action, reports the outcome, clears the selection and reloads the list. */
function useBulk() {
  const router = useRouter();
  const sel = useSelection();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<Result<T>>, done: (value: T) => string) =>
    start(async () => {
      const res = await fn();
      if (res.error !== undefined) return void toast.error(res.error);
      toast.success(done(res.value));
      sel.clear();
      router.refresh();
    });
  return { sel, pending, run };
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Products: publish, unpublish, archive, how they are sold, category, delete; for the ticked ones or all matching. */
export function ProductBulkActions({ filter, categories, canDelete }: { filter: ProductFilter; categories: { id: number; name: string }[]; canDelete: boolean }) {
  const { sel, pending, run } = useBulk();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const target = sel.allMatching ? { filter } : { ids: sel.ids };
  const apply = (change: ProductBulkOp, verb: string) =>
    run(
      () => bulkProductsAction(target, change),
      (v: { changed: number; skipped: string[] }) => `${plural(v.changed, "product")} ${verb}${v.skipped.length ? ` · skipped ${v.skipped.join(", ")}` : ""}`,
    );
  return (
    <>
      <Button size="sm" pending={pending} onClick={() => apply({ op: "publish" }, "published")}>
        <Eye /> Publish
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply({ op: "draft" }, "moved to draft")}>
        <EyeOff /> Unpublish
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply({ op: "archive" }, "archived")}>
        <Archive /> Archive
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply({ op: "sell_online" }, "now sold online")} title="Price + Add to cart (products with a price)">
        <ShoppingCart /> Sell online
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply({ op: "quote_only" }, "now quote only")} title="No price, Add to quote">
        <MessageSquareQuote /> Quote only
      </Button>
      <NativeSelect
        size="sm"
        aria-label="Move to category"
        value=""
        disabled={pending}
        onChange={(e) => {
          const c = categories.find((x) => x.id === Number(e.target.value));
          if (c) apply({ op: "category", categoryId: c.id }, `moved to ${c.name}`);
        }}
      >
        <NativeSelectOption value="">Move to category…</NativeSelectOption>
        {categories.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {canDelete && (
        <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
          <Trash2 /> Delete
        </Button>
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {plural(sel.count, "product")}?</AlertDialogTitle>
            <AlertDialogDescription>They disappear from the site and the portal. Past orders keep their lines. This cannot be undone; archive them instead to keep them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => apply({ op: "delete" }, "deleted")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Guides, articles and pages: publish now, take off the site, archive. */
export function PostBulkActions() {
  const { sel, pending, run } = useBulk();
  const apply = (kind: "publish" | "unpublish" | "archive", verb: string) => run(() => bulkPostStatusAction(sel.ids, kind), (n: number) => `${plural(n, "post")} ${verb}`);
  return (
    <>
      <Button size="sm" pending={pending} onClick={() => apply("publish", "published")}>
        <Eye /> Publish
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply("unpublish", "moved to draft")}>
        <EyeOff /> Unpublish
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply("archive", "archived")}>
        <Archive /> Archive
      </Button>
    </>
  );
}

/** Industries, categories and brands: publish, unpublish, archive. */
export function StatusBulkActions({ list, noun }: { list: "industries" | "categories" | "brands"; noun: string }) {
  const { sel, pending, run } = useBulk();
  const apply = (to: "published" | "draft" | "archived", verb: string) => run(() => bulkStatusAction(list, sel.ids, to), (n: number) => `${plural(n, noun)} ${verb}`);
  return (
    <>
      <Button size="sm" pending={pending} onClick={() => apply("published", "published")}>
        <Eye /> Publish
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply("draft", "moved to draft")}>
        <EyeOff /> Unpublish
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => apply("archived", "archived")}>
        <Archive /> Archive
      </Button>
    </>
  );
}

/** Products list filters: search, status and category, kept in the address so paging and "select all" follow them. */
export function ProductFilters({ categories }: { categories: { id: number; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    p.delete("page");
    router.replace(`${path}${p.size ? `?${p}` : ""}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", String(new FormData(e.currentTarget).get("q") ?? "").trim());
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="Name or part number" className="h-8 w-56 pl-8" aria-label="Search products" />
      </form>
      <NativeSelect size="sm" aria-label="Status" value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
        <NativeSelectOption value="">Every status</NativeSelectOption>
        <NativeSelectOption value="published">Published</NativeSelectOption>
        <NativeSelectOption value="draft">Draft</NativeSelectOption>
        <NativeSelectOption value="archived">Archived</NativeSelectOption>
      </NativeSelect>
      <NativeSelect size="sm" aria-label="Category" value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)}>
        <NativeSelectOption value="">Every category</NativeSelectOption>
        <NativeSelectOption value="0">No category</NativeSelectOption>
        {categories.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
