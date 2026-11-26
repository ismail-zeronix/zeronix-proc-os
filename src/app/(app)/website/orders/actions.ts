"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAnyApp, assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { setOrderStatus } from "@/lib/website/store";
import { ORDER_STATUSES } from "@/lib/website/store-core";
import { createSalesOrderFromWeb, salesOrderDraft, type WebToSalesInput } from "@/lib/website/web-to-sales";
import { UserError } from "@/lib/user-error";

/** Sales refusals (UserError) shown as they are, like this app's own problems. */
async function shown<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) throw new Problem(e.message);
    throw e;
  }
}

/** Moves a web order along (confirmed, paid, shipped...) and keeps the team note on it. */
export async function updateOrderAction(id: number, status: (typeof ORDER_STATUSES)[number], internalNote: string): Promise<Result<null>> {
  return attempt(async () => {
    await assertApp("website");
    await setOrderStatus(z.number().int().positive().parse(id), z.enum(ORDER_STATUSES).parse(status), z.string().trim().max(2000).parse(internalNote));
    revalidatePath("/website", "layout");
    return null;
  });
}

const id = z.number().int().positive();

/** What the "Create sales order" dialog opens with: matching customers, salespeople, the lines before VAT. */
export async function salesOrderDraftAction(orderId: number): Promise<Result<Awaited<ReturnType<typeof salesOrderDraft>>>> {
  return attempt(() =>
    shown(async () => {
      await assertApp("website");
      await assertAnyApp("sales", "accounts").catch(() => {
        throw new Problem("Making a Sales order needs the Sales or Accounts app. Ask an admin to give you one.");
      });
      return salesOrderDraft(id.parse(orderId));
    }),
  );
}

const inputSchema = z.object({
  companyId: id.nullable(),
  newCustomer: z
    .object({ name: z.string().trim().max(200), trn: z.string().trim().max(30), emirate: z.string().trim().max(60), address: z.string().trim().max(500), phone: z.string().trim().max(60) })
    .optional(),
  ownerId: id,
  termsDays: z.number().int().min(0).max(365),
});

/** Customer (picked or new) → instant quote → Sales order, and the web order linked to it. */
export async function createSalesOrderAction(orderId: number, input: WebToSalesInput): Promise<Result<{ id: number; number: string }>> {
  return attempt(() =>
    shown(async () => {
      const me = await assertApp("website");
      const v = inputSchema.parse(input);
      const order = await createSalesOrderFromWeb(id.parse(orderId), v, me.id);
      revalidatePath("/website", "layout");
      return order;
    }),
  );
}
