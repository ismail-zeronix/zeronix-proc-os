"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertAccountant } from "@/lib/auth/session";
import { currentOrgId, setTxOrg } from "@/lib/org";
import { saveAdjustmentTx, startStockTx, undoStockStartTx, type StartResult } from "@/lib/inventory/start";
import { voidAdjustmentDoc } from "@/lib/ledger/stock-docs";
import { parseInput, UserError } from "@/lib/user-error";

/**
 * Selling more than is in stock: "allow" lets the invoice go out (stock goes negative and the cost follows when the
 * supplier bill comes); "block" refuses the invoice until the goods are in. An accountant decides, per company.
 */
export async function setNegativeStock(policy: "allow" | "block") {
  const me = await assertAccountant();
  const p = parseInput(z.enum(["allow", "block"]), policy);
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    await tx
      .insert(schema.accountingSettings)
      .values({ organizationId: orgId, negativeStock: p, updatedBy: me.id })
      .onConflictDoUpdate({ target: schema.accountingSettings.organizationId, set: { negativeStock: p, updatedAt: new Date(), updatedBy: me.id } });
    await audit(tx, { userId: me.id, orgId, action: "stock.policy", entity: "accounting_settings", summary: p === "allow" ? "Selling more than in stock: allowed" : "Selling more than in stock: blocked" });
  });
  revalidatePath("/inventory", "layout");
}

/* ---------- stock start and adjustments (lib/inventory/start.ts) ---------- */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");
const qty = z.number().min(0).max(1e7).transform((n) => Math.round(n * 100) / 100);
const serials = z.array(z.string().trim().max(80)).max(5000).default([]);

const startSchema = z.object({
  date: day,
  offset: z.enum(["opening_equity", "inventory"]),
  lines: z.array(z.object({ itemId: z.number().int().positive(), qty, unitCost: z.number().min(0).max(1e9), serials })).max(5000),
});
export type StartStockInput = z.input<typeof startSchema>;

/** Thrown to roll a dry run back after it did everything for real. */
class DryRun extends Error {
  constructor(readonly result: StartResult) {
    super("dry run");
  }
}

/**
 * Starts item stock with the opening count. `check` runs it all and rolls back, so the accountant sees what it would post
 * (or why it cannot) before anything is saved.
 */
export async function startStock(input: StartStockInput, opts: { check?: boolean } = {}): Promise<StartResult> {
  const me = await assertAccountant();
  const d = parseInput(startSchema, input);
  const orgId = await currentOrgId();
  try {
    const result = await db.transaction(async (tx) => {
      await setTxOrg(tx, orgId);
      const r = await startStockTx(tx, orgId, me.id, d);
      if (opts.check) throw new DryRun(r);
      return r;
    });
    revalidatePath("/inventory", "layout");
    revalidatePath("/accounts", "layout");
    return result;
  } catch (e) {
    if (e instanceof DryRun) return e.result;
    throw e;
  }
}

export async function undoStockStart(reason: string) {
  const me = await assertAccountant();
  const why = parseInput(z.string().trim().min(3, "Say why the start is undone").max(300), reason);
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    await undoStockStartTx(tx, orgId, me.id, why);
  });
  revalidatePath("/inventory", "layout");
  revalidatePath("/accounts", "layout");
}

const adjustSchema = z.object({
  date: day,
  kind: z.enum(["count", "write_off"]),
  reason: z.string().trim().min(3, "Say why (for example: year-end count, damaged in the store)").max(300),
  lines: z.array(z.object({ itemId: z.number().int().positive(), qty, unitCost: z.number().min(0).max(1e9).nullable().optional(), serials })).min(1, "Add at least one item.").max(2000),
});
export type AdjustmentInput = z.input<typeof adjustSchema>;

export async function saveAdjustment(input: AdjustmentInput): Promise<{ id: number; number: string }> {
  const me = await assertAccountant();
  const d = parseInput(adjustSchema, input);
  const orgId = await currentOrgId();
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    return saveAdjustmentTx(tx, orgId, me.id, d);
  });
  revalidatePath("/inventory", "layout");
  return r;
}

export async function voidAdjustment(id: number, reason: string) {
  const me = await assertAccountant();
  const why = parseInput(z.string().trim().min(3, "Say why it is voided").max(300), reason);
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [a] = await tx.select({ kind: schema.stockAdjustments.kind, number: schema.stockAdjustments.number }).from(schema.stockAdjustments).where(eq(schema.stockAdjustments.id, id));
    if (a?.kind === "opening") throw new UserError("The opening count is undone from Inventory › Settings (Undo stock start).");
    await voidAdjustmentDoc(tx, orgId, id, `${a?.number ?? "Adjustment"} voided: ${why}`, me.id);
    await audit(tx, { userId: me.id, orgId, action: "stock.adjust_void", entity: "stock_adjustment", entityId: id, summary: `${a?.number} voided: ${why}` });
  });
  revalidatePath("/inventory", "layout");
}
