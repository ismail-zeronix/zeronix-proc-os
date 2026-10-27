import { type NextRequest } from "next/server";
import { mailApi } from "@/lib/mail/api";
import { loadMessage } from "@/lib/mail/message";

/** One email, with its HTML made safe. `images=1` also allows remote images. */
export function GET(req: NextRequest) {
  return mailApi(async (c) => {
    const uid = Number(req.nextUrl.searchParams.get("uid"));
    if (!Number.isInteger(uid) || uid < 1) return Response.json({ error: "Bad message number", code: "error" }, { status: 400 });
    const message = await loadMessage(c, uid, req.nextUrl.searchParams.get("images") === "1");
    return Response.json(message, { headers: { "Cache-Control": "private, no-store" } });
  });
}
