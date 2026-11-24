"use server";

import { and, eq } from "drizzle-orm";
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
 * A cold call from the My Day list. Allowed for the prospect's owner (an admin gives prospects to a salesman) or anyone
 * with the Prospecting app. "Not interested" takes the prospect off the call list for good (disqualified).
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
  if (!p || (p.ownerId !== me.id && !access.apps.includes("prospecting"))) throw new UserError("That prospect is not on your list.");
  const label = outcomeLabel(d.outcome);
  await db.transaction(async (tx) => {
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
