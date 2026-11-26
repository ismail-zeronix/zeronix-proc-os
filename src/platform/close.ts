import "server-only";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { PlatformSession } from "@/lib/auth/platform-token";
import { addDays } from "@/lib/billing";
import { dubaiToday } from "@/lib/dates";
import { FILES_DIR, fileStore, removeStoredFile } from "@/lib/files-store";
import { buildOrgExport } from "@/lib/org-export";
import { UserError } from "@/lib/user-error";
import { platformDb, schema } from "./db";
import { platformAudit } from "./session";

/**
 * Closing an organisation (platform console): pause it, schedule the deletion CLOSE_DAYS ahead (it can be cancelled
 * until then), and on or after that day delete it for good with platform_delete_org(). Nothing is deleted by itself:
 * a platform admin presses the final button. An organisation nobody ever joined can be deleted straight away.
 */
export const CLOSE_DAYS = 30;

async function org(id: number) {
  const [o] = await platformDb
    .select({ id: schema.organizations.id, name: schema.organizations.name, status: schema.organizations.status, deleteAfter: schema.organizations.deleteAfter })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, id));
  if (!o) throw new UserError("That organisation does not exist.");
  return o;
}

/** The typed name must match, so a wrong tab cannot close the wrong company. */
function confirmName(o: { name: string }, typed: string) {
  if (typed.trim().toLowerCase() !== o.name.trim().toLowerCase()) throw new UserError(`Type the company's name exactly: ${o.name}`);
}

export async function scheduleDeletion(admin: PlatformSession, id: number, typedName: string, reason: string): Promise<{ deleteAfter: string }> {
  if (id === 1) throw new UserError("Organisation 1 is never deleted.");
  const o = await org(id);
  confirmName(o, typedName);
  if (reason.trim().length < 3) throw new UserError("Say why (recorded).");
  if (o.status !== "suspended") throw new UserError("Pause the company first: nobody should be working in it while it waits to be deleted.");
  const deleteAfter = addDays(dubaiToday(), CLOSE_DAYS);
  await platformDb.update(schema.organizations).set({ deleteAfter, updatedAt: new Date() }).where(eq(schema.organizations.id, id));
  await platformAudit({ admin, action: "tenant.close", orgId: id, summary: `${o.name}: deletion scheduled from ${deleteAfter}`, reason });
  return { deleteAfter };
}

export async function cancelDeletion(admin: PlatformSession, id: number) {
  const o = await org(id);
  if (!o.deleteAfter) throw new UserError("No deletion is scheduled.");
  await platformDb.update(schema.organizations).set({ deleteAfter: null, updatedAt: new Date() }).where(eq(schema.organizations.id, id));
  await platformAudit({ admin, action: "tenant.close_cancel", orgId: id, summary: `${o.name}: deletion cancelled` });
}

/**
 * Deletes the organisation for good: every row (platform_delete_org(), which checks again that it is paused and due)
 * and its stored files. The platform's audit trail keeps the record of it.
 */
export async function deleteTenantNow(admin: PlatformSession, id: number, typedName: string): Promise<{ rows: number; files: number }> {
  const o = await org(id);
  confirmName(o, typedName);
  const stored = (await platformDb.select({ storedName: schema.files.storedName }).from(schema.files).where(eq(schema.files.organizationId, id))).map((f) => f.storedName);
  const exports = (await platformDb.select({ storedName: schema.exportJobs.storedName }).from(schema.exportJobs).where(eq(schema.exportJobs.organizationId, id)))
    .map((e) => e.storedName)
    .filter((s): s is string => !!s);
  let rows = 0;
  try {
    const r = await platformDb.execute<{ n: number }>(sql`SELECT platform_delete_org(${id}) AS n`);
    rows = Number(r.rows[0]?.n ?? 0);
  } catch (e) {
    const msg = (e as { cause?: { message?: string }; message?: string }).cause?.message ?? (e as Error).message;
    if (/pause the organisation|deletion date|never deleted/.test(msg)) throw new UserError(msg.charAt(0).toUpperCase() + msg.slice(1) + ".");
    throw e;
  }
  // the rows are gone; now the files on disk (a file that cannot be removed is only logged)
  let files = 0;
  for (const name of stored) {
    try {
      await removeStoredFile(name);
      files++;
    } catch (e) {
      console.error(`[close] could not remove file ${name}:`, (e as Error).message);
    }
  }
  const exportStore = fileStore(path.join(FILES_DIR, "exports"));
  for (const name of exports) await exportStore.remove(name).catch(() => {});
  await platformAudit({ admin, action: "tenant.delete", orgId: null, summary: `${o.name} (#${id}) deleted for good: ${rows} rows, ${files} files` });
  return { rows, files };
}

/** The organisation's data as a ZIP for the platform (before closing it, or when its admin cannot sign in). */
export async function platformExport(admin: PlatformSession, id: number) {
  const o = await org(id);
  const r = await buildOrgExport(platformDb, id, o.name);
  await platformAudit({ admin, action: "tenant.export", orgId: id, summary: `${o.name}: all data downloaded (${r.tables} tables, ${r.rows} rows, ${r.files} files)` });
  return { ...r, name: o.name };
}
