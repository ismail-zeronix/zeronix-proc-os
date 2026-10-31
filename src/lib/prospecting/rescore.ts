import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AUTO_READY_FROM, readyGaps, scoreProspect } from "./score";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Works a prospect's score out again from what is stored now. Called after anything that feeds it changes. When the
 * prospect is still being researched and nothing is missing any more, it moves to Ready by itself. Returns true then.
 */
export async function rescoreIn(tx: Tx | typeof db, companyId: number, today: string): Promise<boolean> {
  const [c] = await tx.select().from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
  if (!c) return false;
  const signals = await tx.select({ kind: schema.prospectSignals.kind, observedOn: schema.prospectSignals.observedOn }).from(schema.prospectSignals).where(eq(schema.prospectSignals.companyId, companyId));
  const people = await tx
    .select({ roleKind: schema.prospectPeople.roleKind, email: schema.prospectPeople.email, emailStatus: schema.prospectPeople.emailStatus, phone: schema.prospectPeople.phone, isPrimary: schema.prospectPeople.isPrimary })
    .from(schema.prospectPeople)
    .where(eq(schema.prospectPeople.companyId, companyId));
  const s = scoreProspect({ ...c, signals, people }, today);
  const ready = AUTO_READY_FROM.includes(c.status) && readyGaps({ score: s.total, personalLine: c.personalLine, people }).length === 0;
  await tx
    .update(schema.prospectCompanies)
    .set({ scoreFit: s.fit, scoreSignal: s.signal, scoreReach: s.reach, score: s.total, ...(ready ? { status: "ready", statusChangedAt: new Date() } : {}) })
    .where(eq(schema.prospectCompanies.id, companyId));
  if (ready) await tx.insert(schema.prospectActivities).values({ companyId, userId: null, kind: "status", body: "Moved to Ready: key person, email and personal line are in place" });
  return ready;
}
