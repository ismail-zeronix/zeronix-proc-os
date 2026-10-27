import { type NextRequest } from "next/server";
import { mailApi } from "@/lib/mail/api";
import { loadAttachment } from "@/lib/mail/message";

/** Downloads one attachment of one of the user's own emails. Always a download, never shown inline. */
export function GET(req: NextRequest) {
  return mailApi(async (c) => {
    const uid = Number(req.nextUrl.searchParams.get("uid"));
    const index = Number(req.nextUrl.searchParams.get("i"));
    if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(index) || index < 0) {
      return Response.json({ error: "Bad request", code: "error" }, { status: 400 });
    }
    const a = await loadAttachment(c, uid, index);
    const safeName = a.filename.replace(/[\r\n"\\/]/g, "_");
    return new Response(new Uint8Array(a.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
