import { createHash, timingSafeEqual } from "node:crypto";
import { changedUrls, indexNowKey, submitIndexNow } from "@/lib/indexnow";
import { flags } from "@/lib/flags";

/**
 * Sends the whole sitemap to IndexNow once, e.g. right after go-live (website/SEO-PLAN.md). Same secret as
 * /api/revalidate:  curl -X POST -H "x-revalidate-secret: $REVALIDATE_SECRET" https://zeronixtech.com/api/indexnow
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const given = req.headers.get("x-revalidate-secret") ?? "";
  const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
  if (secret.length < 16 || !same(given, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!flags.indexing) return Response.json({ error: "SITE_INDEXING is not true" }, { status: 409 });
  if (!indexNowKey()) return Response.json({ error: "INDEXNOW_KEY is not set" }, { status: 409 });
  const urls = await changedUrls(Infinity);
  const status = await submitIndexNow(urls);
  // 200 and 202 both mean accepted
  return Response.json({ submitted: urls.length, indexNowStatus: status }, { status: status === 200 || status === 202 ? 200 : 502 });
}
