import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { parseRef, whoCanSee } from "@/lib/chat/cards";
import { listTeammates } from "@/lib/chat/channels";
import { presenceMap } from "@/lib/chat/presence";

/**
 * Active teammates to start a chat with or mention, and how each shows right now (online, away, do not disturb; missing = offline). With `?record=deal:12`,
 * also says which of them may see that record (to warn before mentioning someone who cannot).
 */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const users = await listTeammates(access.user.id);
  const record = parseRef(req.nextUrl.searchParams.get("record") ?? "");
  const canSee = record ? [...(await whoCanSee(record, users.map((u) => u.id)))] : undefined;
  return Response.json({ users, presence: await presenceMap(), canSee });
}
