import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "next/navigation";
import { assertApp, loadAccess, requireApp } from "@/lib/auth/session";
import { Problem } from "./result";

type SessionUser = Awaited<ReturnType<typeof assertApp>>;

/**
 * Who may do what in Outreach (the Prospecting app with Newsletter inside it, Phase 5 of the sales routine).
 * Full = admins and "All data" users: every prospect, campaigns, newsletters, imports, settings.
 * Everyone else with the app (salesmen) works their own prospects and the unassigned pool: list, open, call, note,
 * edit, add people, convert a reply to a lead. Touching an unassigned prospect makes it theirs.
 */
export interface OutreachAccess {
  me: SessionUser;
  full: boolean;
}

export async function outreachAccess(): Promise<OutreachAccess> {
  const me = await assertApp("prospecting");
  const access = await loadAccess();
  return { me, full: !!access && (access.user.role === "admin" || access.seesAll) };
}

/** For pages (no punch-in needed to look): full access or not. */
export async function outreachView(): Promise<{ userId: number; full: boolean }> {
  const access = await loadAccess();
  return { userId: access?.user.id ?? 0, full: !!access && (access.user.role === "admin" || access.seesAll) };
}

/** Campaigns, newsletters, imports, settings, deleting and handing out prospects: admins and "All data" users only. */
export async function assertOutreachFull(): Promise<SessionUser> {
  const a = await outreachAccess();
  if (!a.full) throw new Problem("Only an admin can do that in Outreach.");
  return a.me;
}

/** SQL filter for a salesman's prospects: their own and the unassigned pool. */
export const mineOrPool = (userId: number) => or(eq(schema.prospectCompanies.ownerId, userId), isNull(schema.prospectCompanies.ownerId));

/**
 * The prospects must be the person's own or unassigned (full access: any). Unassigned ones become theirs, so two
 * salesmen never work the same company.
 */
export async function assertProspects(ids: number[]): Promise<OutreachAccess> {
  const a = await outreachAccess();
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  if (!unique.length || a.full) return a;
  const rows = await db
    .select({ id: schema.prospectCompanies.id, ownerId: schema.prospectCompanies.ownerId })
    .from(schema.prospectCompanies)
    .where(inArray(schema.prospectCompanies.id, unique));
  if (rows.some((r) => r.ownerId != null && r.ownerId !== a.me.id)) throw new Problem("That prospect belongs to someone else.");
  await claim(unique, a.me.id);
  return a;
}

/** Gives unassigned prospects to this person. */
export async function claim(ids: number[], userId: number) {
  if (!ids.length) return;
  await db
    .update(schema.prospectCompanies)
    .set({ ownerId: userId })
    .where(and(inArray(schema.prospectCompanies.id, ids), isNull(schema.prospectCompanies.ownerId)));
}

/** The prospect a person or signal belongs to. */
export async function companyOfPerson(personId: number): Promise<number> {
  const [p] = await db.select({ c: schema.prospectPeople.companyId }).from(schema.prospectPeople).where(eq(schema.prospectPeople.id, personId));
  if (!p) throw new Problem("That person is no longer on the prospect.");
  return p.c;
}
export async function companyOfSignal(signalId: number): Promise<number> {
  const r = await db.execute<{ c: number }>(sql`SELECT company_id AS c FROM prospect_signals WHERE id = ${signalId}`);
  if (!r.rows[0]) throw new Problem("That signal no longer exists.");
  return Number(r.rows[0].c);
}

/** May this viewer open this prospect's page? */
export function canOpenProspect(view: { userId: number; full: boolean }, ownerId: number | null) {
  return view.full || ownerId == null || ownerId === view.userId;
}

/** Pages only admins and "All data" users see (campaigns, newsletters, import, setup): others get "page does not exist". */
export async function requireOutreachFull() {
  const access = await requireApp("prospecting");
  if (!(access.user.role === "admin" || access.seesAll)) notFound();
  return access;
}
