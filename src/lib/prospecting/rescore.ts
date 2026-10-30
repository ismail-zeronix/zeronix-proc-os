import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { scoreProspect } from "./score";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Works a prospect's score out again from what is stored now. Called after anything that feeds it changes. */
export async function rescoreIn(tx: Tx | typeof db, companyId: number, today: string) {
  const [c] = await tx.select().from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
  if (!c) return;
  const signals = await tx.select({ kind: schema.prospectSignals.kind, observedOn: schema.prospectSignals.observedOn }).from(schema.prospectSignals).where(eq(schema.prospectSignals.companyId, companyId));
  const people = await tx
    .select({ roleKind: schema.prospectPeople.roleKind, email: schema.prospectPeople.email, emailStatus: schema.prospectPeople.emailStatus, phone: schema.prospectPeople.phone })
    .from(schema.prospectPeople)
    .where(eq(schema.prospectPeople.companyId, companyId));
  const s = scoreProspect({ ...c, signals, people }, today);
  await tx.update(schema.prospectCompanies).set({ scoreFit: s.fit, scoreSignal: s.signal, scoreReach: s.reach, score: s.total }).where(eq(schema.prospectCompanies.id, companyId));
}
