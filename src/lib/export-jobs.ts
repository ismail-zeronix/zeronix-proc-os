import "server-only";
import path from "node:path";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import { exportPriority, extensionOf, fileNameOf } from "@/lib/export-urls";
import { FILES_DIR, fileStore } from "@/lib/files-store";
import { internalUrl } from "@/lib/pdf";

/**
 * Downloads that take a while run here instead of inside the request. A button adds a job; the worker makes the files one
 * at a time by opening the same address the button used to, as the person who asked, so what they may see is decided in
 * one place. The finished file waits on disk until the browser picks it up, and is removed after a day.
 */
const store = fileStore(path.join(FILES_DIR, "exports"));
const j = schema.exportJobs;
const ACTIVE = ["queued", "running"] as const;
/** Nobody needs more in the line at once, and it stops a stuck button from filling the queue. */
export const MAX_ACTIVE_PER_PERSON = 10;
const KEEP_HOURS = 24;
const STUCK_MINUTES = 20;

export type ExportJob = typeof schema.exportJobs.$inferSelect;

/** How many files will be made before this one. */
async function ahead(job: Pick<ExportJob, "id" | "priority">): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(j)
    .where(and(inArray(j.status, ACTIVE), or(eq(j.status, "running"), lt(j.priority, job.priority), and(eq(j.priority, job.priority), lt(j.id, job.id)))));
  return r.n;
}

/** Adds a file to the line. The same file already on its way is not added twice. */
export async function addExportJob(userId: number, organizationId: number, url: string, label: string) {
  const [same] = await db.select().from(j).where(and(eq(j.userId, userId), eq(j.url, url), inArray(j.status, ACTIVE)));
  if (same) return { job: same, ahead: await ahead(same), duplicate: true };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(j).where(and(eq(j.userId, userId), inArray(j.status, ACTIVE)));
  if (n >= MAX_ACTIVE_PER_PERSON) return null;
  const [job] = await db.insert(j).values({ organizationId, userId, url, label: label.slice(0, 200), priority: exportPriority(url) }).returning();
  return { job, ahead: await ahead(job), duplicate: false };
}

/** What this person's browser needs to know: files on their way, and finished ones it has not picked up in the last hour. */
export async function myExportJobs(userId: number) {
  const list = await db
    .select({ id: j.id, url: j.url, label: j.label, status: j.status, priority: j.priority, error: j.error, fileName: j.fileName })
    .from(j)
    .where(and(eq(j.userId, userId), or(inArray(j.status, ACTIVE), and(isNull(j.claimedAt), sql`${j.finishedAt} > now() - interval '1 hour'`))))
    .orderBy(asc(j.id));
  return list;
}

/** The first browser tab to ask gets to download it, so two open tabs do not both save the file. */
export async function claimExportJob(userId: number, id: number): Promise<boolean> {
  const rows = await db.update(j).set({ claimedAt: new Date() }).where(and(eq(j.id, id), eq(j.userId, userId), isNull(j.claimedAt), inArray(j.status, ["done", "failed"]))).returning({ id: j.id });
  return rows.length > 0;
}

/** The finished file, only for the person who asked. */
export async function exportFile(userId: number, id: number) {
  const [job] = await db.select().from(j).where(and(eq(j.id, id), eq(j.userId, userId), eq(j.status, "done")));
  if (!job?.storedName) return null;
  return { job, data: await store.read(job.storedName) };
}

/** Takes the next file off the line: documents before reports, then in the order asked. Two workers can never take the same one. */
export async function takeNextExport(): Promise<ExportJob | null> {
  const res = await db.execute<{ id: number }>(sql`
    UPDATE export_jobs SET status = 'running', started_at = now()
    WHERE id = (SELECT id FROM export_jobs WHERE status = 'queued' ORDER BY priority, id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`);
  const id = res.rows[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(j).where(eq(j.id, Number(id)));
  return job ?? null;
}

const FRIENDLY = "This file could not be made. Please try again, or tell whoever looks after the system.";

/** Makes one file. A failure is kept on the job for the person to see, with the details in the server log only. */
export async function runExportJob(job: ExportJob, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const [u] = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive, sv: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, job.userId));
    if (!u?.isActive) throw new Error("the person who asked is no longer active");
    const session = await signSession({ id: u.id, name: u.name, email: u.email, role: u.role, sv: u.sv });
    const res = await fetcher(internalUrl() + job.url, { headers: { cookie: `${SESSION_COOKIE}=${session}` }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(STUCK_MINUTES * 60_000) });
    if (!res.ok) throw new Error(`the address answered ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type");
    const fileName = fileNameOf(res.headers.get("content-disposition"), job.label);
    const storedName = await store.save(data, extensionOf(contentType, fileName));
    await db.update(j).set({ status: "done", fileName, contentType: contentType ?? "application/octet-stream", storedName, sizeBytes: data.length, finishedAt: new Date() }).where(eq(j.id, job.id));
  } catch (e) {
    console.error(`[exports] job ${job.id} (${job.url}) failed:`, e);
    await db.update(j).set({ status: "failed", error: FRIENDLY, finishedAt: new Date() }).where(eq(j.id, job.id));
  }
}

/** After a restart nothing is being made any more: put what was under way back in the line. */
export async function requeueInterrupted(): Promise<void> {
  await db.update(j).set({ status: "queued", startedAt: null }).where(eq(j.status, "running"));
}

/** Removes files older than a day, and gives up on a job stuck far longer than any file takes. */
export async function cleanExportJobs(): Promise<void> {
  await db
    .update(j)
    .set({ status: "failed", error: FRIENDLY, finishedAt: new Date() })
    .where(and(eq(j.status, "running"), sql`${j.startedAt} < now() - make_interval(mins => ${STUCK_MINUTES})`));
  const old = await db
    .select({ id: j.id, storedName: j.storedName })
    .from(j)
    .where(and(inArray(j.status, ["done", "failed"]), sql`${j.finishedAt} < now() - make_interval(hours => ${KEEP_HOURS})`));
  for (const o of old) {
    if (o.storedName) await store.remove(o.storedName).catch((e) => console.error("[exports] could not remove a file", e));
    await db.delete(j).where(eq(j.id, o.id));
  }
}
