import { loadAccess } from "@/lib/auth/session";
import { prefsOf } from "@/lib/chat/presence";

/** My chat settings: status (do not disturb), sound and desktop alerts. */
export async function GET() {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await prefsOf(access.user.id));
}
