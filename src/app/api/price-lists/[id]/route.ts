import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";

export async function GET(_req: Request, ctx: RouteContext<"/api/price-lists/[id]">) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const [row] = await db
    .select({ pl: schema.priceLists, supplierName: schema.suppliers.name })
    .from(schema.priceLists)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
    .where(eq(schema.priceLists.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { pl } = row;
  return NextResponse.json({
    id: pl.id,
    supplierId: pl.supplierId,
    supplierName: row.supplierName,
    status: pl.status,
    progressDone: pl.progressDone,
    progressTotal: pl.progressTotal,
    reusedBlocks: pl.reusedBlocks,
    aiRunning: (await getSetting("ai_running")) === "true",
    source: pl.source,
    sourceName: pl.sourceName,
    error: pl.error,
    model: pl.model,
    parseMs: pl.parseMs,
    receivedAt: pl.receivedAt,
    rawText: pl.rawText,
    drafts: pl.drafts ?? [],
  });
}
