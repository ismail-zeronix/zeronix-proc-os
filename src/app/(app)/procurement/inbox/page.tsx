import { asc, desc, eq, sql } from "drizzle-orm";
import { FileSpreadsheet, MessageCircle } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { SUPPLIER_TYPES } from "@/lib/supplier-types";
import { UnknownSender } from "./inbox-ui";

export const metadata = { title: "Inbox · Procurement · Zeronix" };

/**
 * What waits for a person: WhatsApp messages from senders we do not know yet, and lists with lines to check (unclear
 * lines from Claude's pushes, and Excel uploads not saved yet). Everything else Claude pushed is in Search already.
 */
export default async function InboxPage() {
  await requireApp("procurement");
  const [unknown, lists, suppliers] = await Promise.all([
    db.select().from(schema.stockInbox).orderBy(desc(schema.stockInbox.messageAt)).limit(200),
    db
      .select({
        id: schema.priceLists.id,
        source: schema.priceLists.source,
        sourceName: schema.priceLists.sourceName,
        chat: schema.priceLists.chat,
        receivedAt: schema.priceLists.receivedAt,
        supplier: schema.suppliers.name,
        lines: sql<number>`coalesce(jsonb_array_length(${schema.priceLists.drafts}), 0)`,
        saved: sql<number>`(SELECT count(*)::int FROM offers o WHERE o.price_list_id = ${schema.priceLists.id})`,
      })
      .from(schema.priceLists)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
      .where(eq(schema.priceLists.status, "review"))
      .orderBy(desc(schema.priceLists.receivedAt))
      .limit(200),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);
  const nothing = !unknown.length && !lists.length;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <PageToolbar title="Inbox" meta={nothing ? "Nothing waits" : `${unknown.length + lists.length} to check`} />

      {nothing && (
        <div className="rounded-xl border bg-card py-12 text-center">
          <p className="font-medium">All clear</p>
          <p className="text-sm text-muted-foreground">Everything Claude pushed is in Search.</p>
        </div>
      )}

      {unknown.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">Who is this? ({unknown.length})</h2>
          {unknown.map((m) => (
            <UnknownSender
              key={m.id}
              suppliers={suppliers}
              types={SUPPLIER_TYPES.map((t) => ({ key: t.key, label: t.label }))}
              message={{
                id: m.id,
                chat: m.chat,
                senderName: m.senderName,
                senderPhone: m.senderPhone,
                messageAt: m.messageAt.toISOString(),
                preview: m.messageText.slice(0, 400),
                lines: Array.isArray(m.items) ? m.items.length : 0,
              }}
            />
          ))}
        </section>
      )}

      {lists.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">Lines to check ({lists.length})</h2>
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {lists.map((l) => (
              <Link key={l.id} href={`/procurement/import/${l.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-muted/50">
                {l.source === "excel" ? <FileSpreadsheet className="size-4 text-muted-foreground" /> : <MessageCircle className="size-4 text-muted-foreground" />}
                <span className="font-medium">{l.supplier}</span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {l.source === "excel" ? `Excel: ${l.sourceName}` : l.chat ? `WhatsApp: ${l.chat}` : l.source === "feed" ? "Live feed" : "Price list"}
                </span>
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {l.saved > 0 && <span>{l.saved} saved</span>}
                  <Badge>{l.lines} to check</Badge>
                  <span>{ago(l.receivedAt)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
