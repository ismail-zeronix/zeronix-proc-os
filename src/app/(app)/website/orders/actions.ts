"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, type Result } from "@/lib/prospecting/result";
import { setOrderStatus } from "@/lib/website/store";
import { ORDER_STATUSES } from "@/lib/website/store-core";

/** Moves a web order along (confirmed, paid, shipped...) and keeps the team note on it. */
export async function updateOrderAction(id: number, status: (typeof ORDER_STATUSES)[number], internalNote: string): Promise<Result<null>> {
  return attempt(async () => {
    await assertApp("website");
    await setOrderStatus(z.number().int().positive().parse(id), z.enum(ORDER_STATUSES).parse(status), z.string().trim().max(2000).parse(internalNote));
    revalidatePath("/website", "layout");
    return null;
  });
}
