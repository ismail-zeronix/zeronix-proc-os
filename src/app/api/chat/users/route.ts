import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadAccess } from "@/lib/auth/session";
import { onlineUserIds } from "@/lib/chat/bus";

/** Active teammates to start a chat with, and who has the portal open right now. */
export async function GET() {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle })
    .from(schema.users)
    .where(and(eq(schema.users.isActive, true), ne(schema.users.id, access.user.id)))
    .orderBy(asc(schema.users.name));
  return Response.json({ users, online: onlineUserIds() });
}
