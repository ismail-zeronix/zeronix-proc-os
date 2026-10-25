import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { searchMessages } from "@/lib/chat/search";

/** Messages matching `?q=` in the conversations the signed-in person is in, newest first. */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  return Response.json({ results: q.length < 2 ? [] : await searchMessages(access.user.id, q) });
}
