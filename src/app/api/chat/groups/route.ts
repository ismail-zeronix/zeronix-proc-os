import { loadAccess } from "@/lib/auth/session";
import { listOpenGroups } from "@/lib/chat/channels";

/** Public channels the user can join. */
export async function GET() {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ groups: await listOpenGroups(access.user.id) });
}
