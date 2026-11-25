import "server-only";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { allowedApps } from "@/lib/apps";
import { getSetting } from "@/lib/settings";
import { targetsFor, teamTargets, type TargetOverride, type Targets } from "@/lib/routine";

/** Who is on the sales routine: active sales-role people with the CRM app, unless Admin switched it off for them. */
export function isOnRoutine(u: { role: string; apps: string[] | null; isActive?: boolean; salesTargets: TargetOverride | null }) {
  if (u.role !== "sales" || u.isActive === false || u.salesTargets?.off) return false;
  return allowedApps({ role: u.role as "sales", apps: u.apps }).includes("crm");
}

export const teamTargetsNow = cache(async (): Promise<Targets> => teamTargets(await getSetting("sales_targets")));

export interface RoutineUser {
  id: number;
  name: string;
  targets: Targets;
}

/** One person's routine: their targets, or null when they are not on it. Cached per request. */
export const routineFor = cache(async (userId: number): Promise<RoutineUser | null> => {
  const [u] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      apps: schema.users.apps,
      isActive: schema.users.isActive,
      salesTargets: schema.users.salesTargets,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u || !isOnRoutine(u)) return null;
  return { id: u.id, name: u.name, targets: targetsFor(await teamTargetsNow(), u.salesTargets) };
});

/** Everyone on the routine (the nudges and the owner's views). */
export async function routineUsers(): Promise<RoutineUser[]> {
  const [team, list] = await Promise.all([
    teamTargetsNow(),
    db
      .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, apps: schema.users.apps, salesTargets: schema.users.salesTargets })
      .from(schema.users)
      .where(and(eq(schema.users.isActive, true), eq(schema.users.role, "sales"))),
  ]);
  return list.filter(isOnRoutine).map((u) => ({ id: u.id, name: u.name, targets: targetsFor(team, u.salesTargets) }));
}
