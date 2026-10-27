import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Database reachability for the deploy script and uptime monitors. Public by design, reveals nothing else. */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: "ok", database: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "error", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
