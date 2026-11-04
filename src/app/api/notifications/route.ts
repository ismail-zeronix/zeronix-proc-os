import { loadAccess } from "@/lib/auth/session";
import { bellFor } from "@/lib/notifications";

/** The bell's data: open lines and the unread count (works before punch-in, so nobody misses an alert). */
export async function GET() {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await bellFor(access.user.id));
}
