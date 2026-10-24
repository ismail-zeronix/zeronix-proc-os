import { and, asc, eq, ne } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { loadAccess } from "@/lib/auth/session";
import { onlineUserIds } from "@/lib/chat/bus";
import { parseRef, whoCanSee } from "@/lib/chat/cards";

/**
 * Active teammates to start a chat with or mention, and who has the portal open right now. With `?record=deal:12`,
 * also says which of them may see that record (to warn before mentioning someone who cannot).
 */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle })
    .from(schema.users)
    .where(and(eq(schema.users.isActive, true), ne(schema.users.id, access.user.id)))
    .orderBy(asc(schema.users.name));
  const record = parseRef(req.nextUrl.searchParams.get("record") ?? "");
  const canSee = record ? [...(await whoCanSee(record, users.map((u) => u.id)))] : undefined;
  return Response.json({ users, online: onlineUserIds(), canSee });
}
