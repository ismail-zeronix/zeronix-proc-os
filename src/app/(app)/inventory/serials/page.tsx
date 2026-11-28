import Link from "next/link";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { requireApp } from "@/lib/auth/session";
import { searchSerials } from "@/lib/inventory/data";
import { currentOrgId } from "@/lib/org";
import { longDay } from "@/lib/quotation";
import { param } from "@/lib/sales-base";

export const metadata = { title: "Serial numbers · Zeronix Inventory" };

const STATUS: Record<string, { label: string; tone: "default" | "secondary" | "outline" }> = {
  in_stock: { label: "In stock", tone: "default" },
  sold: { label: "Sold", tone: "secondary" },
  returned: { label: "Back with the supplier", tone: "outline" },
  written_off: { label: "Written off", tone: "outline" },
};

/** Find a serial number (warranty claims, returns): where it is now, and the last document it moved on. */
export default async function SerialsPage({ searchParams }: PageProps<"/inventory/serials">) {
  await requireApp("inventory");
  const q = (param((await searchParams).q) ?? "").trim();
  const rows = await searchSerials(await currentOrgId(), q);
  return (
    <div className="grid gap-3">
      <PageToolbar title="Serial numbers" meta="Where a unit is now, and the document it last moved on">
        <div className="ml-auto">
          <ListSearch placeholder="Serial number (3+ characters)…" />
        </div>
      </PageToolbar>
      {q.replace(/\s+/g, "").length < 3 ? (
        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">Type at least 3 characters of a serial number. Any part matches; spaces and case are ignored.</p>
      ) : !rows.length ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No serial number contains &ldquo;{q}&rdquo;.</p>
      ) : (
        <ul className="grid divide-y rounded-xl border bg-card text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="font-mono font-medium">{r.serial}</span>
              <Badge variant={STATUS[r.status]?.tone ?? "outline"}>{STATUS[r.status]?.label ?? r.status}</Badge>
              <Link href={`/inventory/items/${r.itemId}`} className="min-w-0 flex-1 truncate hover:underline">
                {r.name} <span className="text-xs text-muted-foreground">{r.sku}</span>
              </Link>
              {r.doc && (
                <span className="text-xs text-muted-foreground">
                  {r.doc.href ? (
                    <Link href={r.doc.href} className="font-medium text-foreground hover:underline">
                      {r.doc.number}
                    </Link>
                  ) : (
                    r.doc.number
                  )}
                  {r.doc.party ? ` · ${r.doc.party}` : ""}
                  {r.date ? ` · ${longDay(r.date)}` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
