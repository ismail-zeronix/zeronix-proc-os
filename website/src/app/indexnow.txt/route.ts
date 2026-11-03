import { indexNowKey } from "@/lib/indexnow";

/** The IndexNow key file: proves to Bing and the other IndexNow engines that the submissions come from this site. */
export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export const dynamic = "force-dynamic";
