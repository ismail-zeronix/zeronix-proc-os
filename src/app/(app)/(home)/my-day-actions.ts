"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { isPunchedIn, loadAccess, NOT_PUNCHED_IN } from "@/lib/auth/session";
import { OUTCOME_KEYS, outcomeLabel } from "@/lib/sales";
import { parseInput, UserError } from "@/lib/user-error";

const callSchema = z.object({
  outcome: z.enum(OUTCOME_KEYS),
  body: z.string().trim().max(2000).default(""),
});

/**
 * A cold call (My Day list, Outreach › Call mode). Allowed for the prospect's owner; with the Outreach app also for an
 * unassigned prospect (it becomes theirs), and for admins and "All data" users on any. "Not interested" takes the
 * prospect off the call list for good (disqualified).
 */
export async function logProspectCall(prospectId: number, input: z.input<typeof callSchema>) {
  const access = await loadAccess();
  if (!access) throw new UserError("Sign in again.");
  const me = access.user;
  if (!(await isPunchedIn(me.id))) throw new UserError(NOT_PUNCHED_IN);
  const d = parseInput(callSchema, input);
  const [p] = await db
    .select({ id: schema.prospectCompanies.id, ownerId: schema.prospectCompanies.ownerId, status: schema.prospectCompanies.status })
    .from(schema.prospectCompanies)
    .where(eq(schema.prospectCompanies.id, prospectId));
  const full = me.role === "admin" || access.seesAll;
  const can = !!p && (p.ownerId === me.id || (access.apps.includes("prospecting") && (full || p.ownerId == null)));
  if (!p || !can) throw new UserError("That prospect is not on your list.");
  const label = outcomeLabel(d.outcome);
  await db.transaction(async (tx) => {
    // whoever calls an unassigned prospect is now working it
    if (p.ownerId == null) await tx.update(schema.prospectCompanies).set({ ownerId: me.id }).where(and(eq(schema.prospectCompanies.id, p.id), isNull(schema.prospectCompanies.ownerId)));
    await tx.insert(schema.prospectActivities).values({ companyId: p.id, userId: me.id, kind: "call", outcome: d.outcome, body: d.body ? `${label}: ${d.body}` : `${label}.` });
    if (d.outcome === "not_interested" && p.status !== "converted") {
      await tx
        .update(schema.prospectCompanies)
        .set({ status: "disqualified", disqualifyReason: "Not interested (cold call)", statusChangedAt: new Date() })
        .where(and(eq(schema.prospectCompanies.id, p.id)));
    }
  });
  revalidatePath("/");
  revalidatePath("/prospecting", "layout");
}
