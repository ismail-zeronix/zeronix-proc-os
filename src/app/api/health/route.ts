import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Liveness + database check for Docker / uptime monitors. Public by design, reveals nothing else. */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
