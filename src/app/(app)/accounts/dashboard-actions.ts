"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { assertApp, loadAccess } from "@/lib/auth/session";
import { cleanLayout, type WidgetPlacement } from "@/lib/dashboard-widgets";
import { currentOrgId } from "@/lib/org";

/** Saves one person's Accounts overview: which widgets, in what order, how wide. Nobody else's changes. */
export async function saveDashboardLayout(layout: WidgetPlacement[]) {
  const me = await assertApp("accounts");
  const access = await loadAccess();
  const clean = cleanLayout(layout, !!access?.accountant);
  const organizationId = await currentOrgId();
  await db
    .insert(schema.dashboardLayouts)
    .values({ organizationId, userId: me.id, dashboard: "accounts", layout: clean })
    .onConflictDoUpdate({ target: [schema.dashboardLayouts.userId, schema.dashboardLayouts.dashboard], set: { layout: clean, updatedAt: new Date() } });
  revalidatePath("/accounts");
  return clean;
}
