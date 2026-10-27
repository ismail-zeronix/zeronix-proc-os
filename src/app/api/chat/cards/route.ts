import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { resolveCards } from "@/lib/chat/cards";

/** Records for cards, read live for the signed-in person: `?refs=deal:12,quote:4`. Records they may not see come back restricted. */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const refs = (req.nextUrl.searchParams.get("refs") ?? "").split(",").filter(Boolean);
  return Response.json({ cards: await resolveCards(access, refs) });
}
