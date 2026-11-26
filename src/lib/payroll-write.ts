import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { currentOrgId, setTxOrg } from "@/lib/org";
import { money } from "@/lib/quotation";
import { UserError } from "@/lib/user-error";

/**
 * Sets a person's monthly salary. Not a server action (the callers check who may do this: Admin › Add user for admins,
 * Payroll for accountants), so it lives outside the "use server" files, where it could be called from a browser.
 */
export async function setSalary(userId: number, base: number, byUserId: number) {
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [u] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
    if (!u) throw new UserError("That user no longer exists.");
    const [before] = await tx.select({ base: schema.employeePay.baseSalary }).from(schema.employeePay).where(eq(schema.employeePay.userId, userId));
    await tx
      .insert(schema.employeePay)
      .values({ organizationId: orgId, userId, baseSalary: base })
      .onConflictDoUpdate({ target: schema.employeePay.userId, set: { baseSalary: base, updatedAt: new Date() } });
    await audit(tx, { userId: byUserId, action: "salary.set", entity: "user", entityId: userId, summary: `Salary of ${u.name} set to ${money(base)}`, before: { base: before?.base ?? 0 }, after: { base } });
  });
}
