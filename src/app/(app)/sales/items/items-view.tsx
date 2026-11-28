import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Access } from "@/lib/auth/session";
import { listCategories, listItems, type ItemRow } from "@/lib/items-data";
import { matching, pageOf, readList, sortRows } from "@/lib/list-params";
import { money } from "@/lib/quotation";
import { param } from "@/lib/sales-base";
import { CategoriesPopover, ImportItemsDialog, ItemDialog, ItemRowMenu, type CategoryOption, type ItemDraft } from "./item-ui";

/** Where the list is opened from: the same items in Sales, Accounts and Inventory. */
export type ItemsBase = "/sales" | "/accounts" | "/inventory";

const TRADER_VIEWS = [
  { key: "all", label: "Active", match: (i: ItemRow) => i.isActive },
  { key: "goods", label: "Goods", match: (i: ItemRow) => i.isActive && i.kind === "goods" },
  { key: "stock", label: "Stock tracked", match: (i: ItemRow) => i.isActive && i.trackStock },
  { key: "services", label: "Services", match: (i: ItemRow) => i.isActive && i.kind === "service" },
  { key: "off", label: "Off", match: (i: ItemRow) => !i.isActive },
] as const;
const SERVICE_VIEWS = [TRADER_VIEWS[0], TRADER_VIEWS[4]] as const;

const draftOf = (i: ItemRow): ItemDraft => ({
  id: i.id,
  sku: i.sku,
  name: i.name,
  description: i.description,
  categoryId: i.categoryId,
  brand: i.brand,
  partNumber: i.partNumber,
  unit: i.unit,
  kind: i.kind,
  trackStock: i.trackStock,
  trackSerials: i.trackSerials,
  salePrice: i.salePrice,
  purchasePrice: i.purchasePrice,
  taxCode: i.taxCode,
  reorderLevel: i.reorderLevel,
  notes: i.notes,
  isActive: i.isActive,
});

/**
 * Items: what the company sells and buys again and again. Pick them on document lines instead of typing. A trader sees
 * goods with brand, part number and stock; a service provider a plain list of services and rates.
 */
export async function ItemsView({ access, base, searchParams }: { access: Access; base: ItemsBase; searchParams: Record<string, string | string[] | undefined> }) {
  const trader = access.trader;
  const VIEWS = trader ? TRADER_VIEWS : SERVICE_VIEWS;
  const view = VIEWS.find((x) => x.key === param(searchParams.view)) ?? VIEWS[0];
  const catParam = Number(param(searchParams.cat));
  const [all, cats] = await Promise.all([listItems(), listCategories()]);
  const categories: CategoryOption[] = cats.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name, kind: c.kind, unit: c.unit, taxCode: c.taxCode, trackStock: c.trackStock, trackSerials: c.trackSerials, items: c.items }));
  const cat = categories.find((c) => c.id === catParam);
  const path = `${base}/items`;
  const list = readList(searchParams, ["name", "sku", "price", "stock"], { sort: "name", dir: "asc" });
  const inView = all.filter((i) => view.match(i) && (!cat || i.categoryId === cat.id));
  const found = matching(inView, list.q, (i) => [i.name, i.sku, i.partNumber, i.brand, i.categoryName, i.description]);
  const sorted = sortRows(found, { name: (i) => i.name.toLowerCase(), sku: (i) => i.sku.toLowerCase(), price: (i) => i.salePrice, stock: (i) => (i.trackStock ? i.onHand : null) }, list);
  const rows = pageOf(sorted, list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={path} sp={searchParams} list={list} align={align} />;
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { view: view.key === "all" ? undefined : view.key, cat: cat ? String(cat.id) : undefined, ...p };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const business = access.businessType;
  const costs = access.finance;
  const noun = trader ? "item" : "service";
  const newButton = (
    <ItemDialog
      categories={categories}
      business={business}
      finance={costs}
      trigger={
        <Button size="sm">
          <Plus /> {trader ? "New item" : "New service"}
        </Button>
      }
    />
  );

  return (
    <div className={LIST_PAGE}>
      <PageToolbar
        title={trader ? "Items" : "Services"}
        meta={`${all.filter((i) => i.isActive).length} active${cat ? ` · ${cat.name}` : ""}${!business ? " · set what the company does in Admin › Settings" : ""}`}
      >
        <Segmented items={VIEWS.map((x) => ({ href: href({ view: x.key === "all" ? undefined : x.key, page: undefined }), label: `${x.label} ${all.filter((i) => x.match(i)).length}`, title: x.label, active: view.key === x.key }))} />
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Link href={href({ cat: undefined })} className={`rounded-md border px-2 py-0.5 text-xs ${!cat ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              All
            </Link>
            {categories.map((c) => (
              <Link key={c.id} href={href({ cat: String(c.id) })} className={`rounded-md border px-2 py-0.5 text-xs ${cat?.id === c.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {c.name}
              </Link>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <ListSearch placeholder={trader ? "SKU, part number, name…" : "Search services…"} />
          <CategoriesPopover categories={categories} business={business} />
          <ImportItemsDialog />
          {newButton}
        </div>
      </PageToolbar>
      <DataTable
        noun={noun}
        total={found.length}
        acrossPages={false}
        selectable={false}
        pager={<ListPager path={path} sp={searchParams} list={list} total={found.length} />}
        empty={
          all.length ? (
            "Nothing matches."
          ) : (
            <span className="grid justify-items-center gap-2">
              {trader ? "No items yet. Add them one by one, or import a CSV." : "No services yet. Add the services you sell and their rates."}
              {newButton}
            </span>
          )
        }
        columns={[
          { label: head(trader ? "Item" : "Service", "name") },
          { label: head("SKU", "sku"), className: "hidden md:table-cell" },
          { label: "Category", className: "hidden lg:table-cell" },
          ...(trader ? [{ label: "Brand · part no.", className: "hidden xl:table-cell" }] : []),
          { label: head(trader ? "Price" : "Rate", "price", "right"), className: "text-right" },
          ...(costs ? [{ label: "Cost", className: "hidden sm:table-cell text-right" }] : []),
          ...(trader ? [{ label: head("In stock", "stock", "right"), className: "text-right" }] : []),
          { label: <span className="sr-only">Actions</span>, className: "w-10" },
        ]}
        rows={rows.map((i) => ({
          id: i.id,
          card: (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ItemDialog item={draftOf(i)} categories={categories} business={business} finance={costs} trigger={<button type="button" className="block truncate text-left font-medium hover:underline">{i.name}</button>} />
                <div className="truncate text-xs text-muted-foreground">{[i.sku, i.categoryName, i.trackStock ? `${i.onHand} ${i.unit} in stock` : ""].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="text-sm tabular-nums">{i.salePrice != null ? money(i.salePrice) : "-"}</span>
            </div>
          ),
          cells: [
            <div key="n" className="max-w-80 min-w-0">
              <ItemDialog item={draftOf(i)} categories={categories} business={business} finance={costs} trigger={<button type="button" className="block max-w-full truncate text-left font-medium hover:underline">{i.name}</button>} />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {!i.isActive && <Badge variant="outline">Off</Badge>}
                {i.kind === "service" && trader && <span>Service</span>}
                {i.trackSerials && <span>Serials</span>}
                <span className="truncate md:hidden">{i.sku}</span>
              </div>
            </div>,
            <span key="s" className="font-mono text-xs">
              {i.sku}
            </span>,
            <span key="c" className="text-xs">
              {i.categoryName ?? "-"}
            </span>,
            ...(trader
              ? [
                  <span key="b" className="text-xs">
                    {[i.brand, i.partNumber].filter(Boolean).join(" · ") || "-"}
                  </span>,
                ]
              : []),
            <span key="p" className="tabular-nums">
              {i.salePrice != null ? money(i.salePrice) : "-"}
              <span className="text-xs text-muted-foreground"> /{i.unit}</span>
            </span>,
            ...(costs
              ? [
                  <span key="k" className="text-xs tabular-nums">
                    {i.purchasePrice != null ? money(i.purchasePrice) : "-"}
                  </span>,
                ]
              : []),
            ...(trader
              ? [
                  <span key="q" className={`tabular-nums ${i.trackStock && i.reorderLevel != null && i.onHand < i.reorderLevel ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {i.trackStock ? (
                      base === "/inventory" ? (
                        <Link href={`/inventory/items/${i.id}`} className="hover:underline" title="Stock card">
                          {i.onHand}
                        </Link>
                      ) : (
                        `${i.onHand}`
                      )
                    ) : (
                      "-"
                    )}
                  </span>,
                ]
              : []),
            <ItemRowMenu key="m" id={i.id} name={i.name} active={i.isActive} />,
          ],
        }))}
      />
    </div>
  );
}
