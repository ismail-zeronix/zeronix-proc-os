import "server-only";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import type { AppKey, BusinessType } from "@/lib/apps";
import { industryByKey } from "@/lib/industries";
import { itemFlags, type StarterCategory } from "@/lib/items";
import { configChanged } from "@/lib/org-config";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";

const C = schema.itemCategories;

/** Adds the categories the company does not have yet (by name, any case), after its own. Returns how many were added. */
export async function addCategories(tx: Tx, orgId: number, list: readonly StarterCategory[], business: BusinessType | null): Promise<number> {
  const have = new Set((await tx.select({ name: C.name }).from(C).where(eq(C.organizationId, orgId))).map((c) => c.name.toLowerCase()));
  const fresh = list.filter((c) => !have.has(c.name.toLowerCase()));
  if (!fresh.length) return 0;
  await tx.insert(C).values(
    fresh.map((c, i) => ({
      organizationId: orgId,
      name: c.name,
      sort: have.size + i + 1,
      unit: c.unit ?? "",
      ...itemFlags({ kind: c.kind, trackStock: !!c.trackStock, trackSerials: !!c.trackSerials }, business),
    })),
  );
  return fresh.length;
}

/**
 * Starts a company from an industry template (once, when it is set up): records the industry, sets the business type
 * if none was chosen yet, and adds the industry's first item categories. Returns the apps the industry suggests, for the
 * caller to grant within the plan. The company can change all of it afterwards.
 */
export async function applyIndustry(tx: Tx, orgId: number, key: string): Promise<{ businessType: BusinessType; apps: AppKey[]; added: number }> {
  const t = industryByKey(key);
  if (!t) throw new UserError("Pick the industry from the list.");
  const [org] = await tx.select({ businessType: schema.organizations.businessType }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).for("update");
  if (!org) throw new UserError("This company no longer exists.");
  const businessType = org.businessType ?? t.businessType;
  await tx.update(schema.organizations).set({ industry: t.key, businessType, updatedAt: new Date() }).where(eq(schema.organizations.id, orgId));
  const added = await addCategories(tx, orgId, t.categories, businessType);
  await configChanged(orgId, "org", tx);
  return { businessType, apps: [...t.apps], added };
}
