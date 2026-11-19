import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/newsletter/unsubscribe";

/**
 * The one-click unsubscribe of RFC 8058: Gmail, Outlook and Apple Mail show an "Unsubscribe" button that POSTs here
 * (the List-Unsubscribe header of every newsletter points at it). Public: src/proxy.ts lets /api/newsletter/unsubscribe/ through, and the
 * signed token says whom it is for. A browser that opens the address (GET) is sent to the confirm page instead.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/newsletter/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const res = await unsubscribe(token, true);
  return res.ok ? new NextResponse(null, { status: 200 }) : NextResponse.json({ error: "Invalid link" }, { status: 400 });
}

export async function GET(req: Request, ctx: RouteContext<"/api/newsletter/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, req.url), 303);
}
