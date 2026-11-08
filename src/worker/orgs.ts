import { sql } from "drizzle-orm";
import { db, runAsOrg } from "@/db";

/**
 * Background jobs run once per active organisation, each inside runAsOrg(), so every query of a job sees that
 * organisation's rows only (row-level security) and a job can never mix two tenants' data. The list comes from the
 * app_active_org_ids() database function: the worker has no session to read organisations through.
 */
export async function activeOrgIds(): Promise<number[]> {
  const r = await db.execute<{ id: number }>(sql`SELECT app_active_org_ids() AS id`);
  return r.rows.map((x) => Number(x.id));
}

/** Runs `fn` for every active organisation, one after another; one failing never stops the others. */
export async function eachOrg(fn: () => Promise<unknown>, name = "job"): Promise<void> {
  let ids: number[];
  try {
    ids = await activeOrgIds();
  } catch (e) {
    console.error(`[${name}] could not list organisations:`, (e as Error).message);
    return;
  }
  for (const id of ids) {
    try {
      await runAsOrg(id, fn);
    } catch (e) {
      console.error(`[${name}] failed for organisation ${id}:`, e);
    }
  }
}

/** The public website (zeronixtech.com, its own database) belongs to one organisation: WEBSITE_ORG_ID, default 1. */
export function websiteOrg<T>(fn: () => Promise<T>): Promise<T> {
  const id = Number(process.env.WEBSITE_ORG_ID ?? 1);
  return runAsOrg(Number.isInteger(id) && id > 0 ? id : 1, fn);
}
