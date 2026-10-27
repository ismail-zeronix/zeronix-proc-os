import { desc, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

const KEEP_DAYS = 60;

/** The signed-in user from a raw Cookie header (the error hook gets headers, not Next's cookies()). */
async function userFromCookie(header: string | string[] | undefined): Promise<number | null> {
  const raw = Array.isArray(header) ? header.join("; ") : (header ?? "");
  const token = raw
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const user = await verifySession(token ? decodeURIComponent(token) : undefined).catch(() => null);
  return user?.id ?? null;
}

/** Saves one server error. Never throws: logging must not turn one failure into two. */
export async function logServerError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routeType?: string; routePath?: string },
) {
  try {
    const e = err instanceof Error ? err : null;
    const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
    await db.insert(schema.errorLog).values({
      path: request.path.slice(0, 500),
      method: request.method,
      routeType: context.routeType ?? "",
      routePath: (context.routePath ?? "").slice(0, 300),
      message: (e?.message ?? String(err)).slice(0, 2000),
      digest,
      stack: (e?.stack ?? "").slice(0, 6000),
      userId: await userFromCookie(request.headers.cookie),
    });
    // keep the table small
    if (Math.random() < 0.05) await db.delete(schema.errorLog).where(lt(schema.errorLog.at, sql`now() - make_interval(days => ${KEEP_DAYS})`));
  } catch (e) {
    console.error("[error-log] could not save an error", e);
  }
}

/** The newest errors for Admin › Errors. */
export async function recentErrors(limit = 100) {
  return db
    .select({
      id: schema.errorLog.id,
      at: schema.errorLog.at,
      path: schema.errorLog.path,
      method: schema.errorLog.method,
      routeType: schema.errorLog.routeType,
      routePath: schema.errorLog.routePath,
      message: schema.errorLog.message,
      digest: schema.errorLog.digest,
      stack: schema.errorLog.stack,
      userName: schema.users.name,
    })
    .from(schema.errorLog)
    .leftJoin(schema.users, sql`${schema.users.id} = ${schema.errorLog.userId}`)
    .orderBy(desc(schema.errorLog.at))
    .limit(limit);
}
