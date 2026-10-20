import { type NextRequest } from "next/server";
import { listInbox } from "@/lib/mail/imap";
import { mailApi } from "@/lib/mail/api";

/** One page of the signed-in user's inbox, read live from the mail server. */
export function GET(req: NextRequest) {
  return mailApi(async (c) => {
    const page = Math.max(0, Number(req.nextUrl.searchParams.get("page")) || 0);
    const res = await listInbox(c.login, c.pass, Math.min(page, 200));
    return Response.json({
      ...res,
      messages: res.messages.map((m) => ({ ...m, receivedAt: m.receivedAt.toISOString() })),
    });
  });
}
