"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { TARGET_FIELDS, type TargetOverride, type Targets } from "@/lib/routine";
import { setSetting } from "@/lib/settings";
import { parseInput, UserError } from "@/lib/user-error";

const n = z.number().int("Whole numbers only").min(0, "A target cannot be below zero").max(1000, "That target is too high");
const teamSchema = z.object({ callsDay: n, prospectsDay: n, leadsWeek: n, quotesWeek: n });

/** CRM › Settings › Targets and check-ins: the team default everyone on the routine starts from. */
export async function saveTeamTargets(input: Targets & { checkinMinutes: number }) {
  const me = await requireAdmin();
  const { checkinMinutes, ...targets } = input;
  const d = parseInput(teamSchema, targets);
  const every = parseInput(z.number().int("Whole minutes only").min(0).max(600, "At most every 600 minutes"), checkinMinutes);
  if (every > 0 && every < 30) throw new UserError("Ask at most every 30 minutes (0 switches check-ins off).");
  await setSetting("sales_targets", JSON.stringify(d));
  await setSetting("checkin_minutes", String(every));
  await audit(db, { userId: me.id, action: "settings.sales_targets", entity: "settings", entityId: 0, summary: `Team targets: ${JSON.stringify(d)}; check-in every ${every} min` });
  revalidatePath("/", "layout");
}

const ownSchema = z.object({
  off: z.boolean().default(false),
  callsDay: n.nullable().default(null),
  prospectsDay: n.nullable().default(null),
  leadsWeek: n.nullable().default(null),
  quotesWeek: n.nullable().default(null),
});

/** Admin › Users › person: their own targets (empty = the team's), or off = not on the sales routine. */
export async function saveUserTargets(userId: number, input: z.input<typeof ownSchema>) {
  const me = await requireAdmin();
  const d = parseInput(ownSchema, input);
  const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new UserError("That user no longer exists.");
  const own: TargetOverride = {};
  if (d.off) own.off = true;
  for (const f of TARGET_FIELDS) if (d[f.key] != null) own[f.key] = d[f.key]!;
  const value = Object.keys(own).length ? own : null;
  await db.update(schema.users).set({ salesTargets: value }).where(eq(schema.users.id, userId));
  await audit(db, { userId: me.id, action: "user.sales_targets", entity: "user", entityId: userId, summary: `${u.name}: ${value ? JSON.stringify(value) : "team targets"}` });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/", "layout");
}
