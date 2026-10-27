"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { assertCompany } from "@/lib/auth/visibility";
import { saveCompanyOwners } from "@/lib/company-owners";
import { customerOwnerUsers } from "@/lib/sales-data";

/**
 * Sets who looks after a customer (several people allowed, the first is the main owner). Every owner sees the customer
 * in their lists. Like sharing a deal, only admins and "All data" users change it.
 */
export async function setCustomerOwners(companyId: number, userIds: number[]) {
  const me = await assertApp("sales");
  const v = await assertCompany(companyId);
  if (!v.seesAll) throw new Error("Only an admin can change who owns a customer.");
  const ids = [...new Set(z.array(z.number().int().positive()).max(10).parse(userIds))];
  const ok = new Set((await customerOwnerUsers()).map((u) => u.id));
  if (ids.some((i) => !ok.has(i))) throw new Error("One of the people you picked cannot use CRM or Sales.");
  const names = ids.length ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const [company] = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!company) throw new Error("That customer no longer exists.");
  await db.transaction(async (tx) => {
    await saveCompanyOwners(tx, companyId, ids);
    await tx.insert(schema.activities).values({
      type: "owner",
      body: ids.length ? `Customer owners: ${ids.map((i) => names.find((n) => n.id === i)?.name ?? "?").join(", ")}.` : "Customer has no owner.",
      companyId,
      userId: me.id,
    });
  });
  revalidatePath("/sales", "layout");
  revalidatePath("/crm", "layout");
}
