import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import type { PlatformSession } from "@/lib/auth/platform-token";
import { UserError } from "@/lib/user-error";
import { platformDb, schema } from "./db";
import { platformAudit } from "./session";

/** Trial requests from the SaaS sign-in page, newest first: the open ones, then the last decided ones. */
export async function listTrialRequests() {
  return platformDb
    .select()
    .from(schema.trialRequests)
    .orderBy(sql`${schema.trialRequests.status} <> 'new'`, desc(schema.trialRequests.createdAt))
    .limit(40);
}

export async function getTrialRequest(id: number) {
  const [r] = await platformDb.select().from(schema.trialRequests).where(eq(schema.trialRequests.id, id));
  return r ?? null;
}

/** Turns a request down (nothing is emailed: write to them yourself if you want to). */
export async function declineTrialRequest(admin: PlatformSession, id: number, reason: string) {
  const [r] = await platformDb
    .update(schema.trialRequests)
    .set({ status: "declined", decidedAt: new Date(), decidedBy: admin.id, declineReason: reason.trim().slice(0, 300) })
    .where(sql`${schema.trialRequests.id} = ${id} AND ${schema.trialRequests.status} = 'new'`)
    .returning({ company: schema.trialRequests.company, email: schema.trialRequests.email });
  if (!r) throw new UserError("That request is not open any more.");
  await platformAudit({ admin, action: "trial.decline", orgId: null, summary: `Trial request from ${r.company} (${r.email}) declined`, reason });
}

/** Marks a request approved once its organisation exists (the console's New organisation form, filled from it). */
export async function markTrialApproved(admin: PlatformSession, id: number, orgId: number) {
  const [r] = await platformDb
    .update(schema.trialRequests)
    .set({ status: "approved", orgId, decidedAt: new Date(), decidedBy: admin.id })
    .where(sql`${schema.trialRequests.id} = ${id} AND ${schema.trialRequests.status} = 'new'`)
    .returning({ company: schema.trialRequests.company });
  if (r) await platformAudit({ admin, action: "trial.approve", orgId, summary: `Trial request from ${r.company} approved` });
}
