import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { autoSubmit } from "@/lib/indexnow";

/**
 * The portal calls this (over site-net) right after something is published, with the cache tags that changed. Those
 * pages are rebuilt on their next visit instead of waiting for the 10-minute refresh.
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const given = req.headers.get("x-revalidate-secret") ?? "";
  const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
  if (secret.length < 16 || !same(given, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === "string" && /^[a-z0-9:_-]{1,120}$/.test(t)).slice(0, 50) : [];
  if (!tags.length) return Response.json({ error: "No tags" }, { status: 400 });
  // expire now: the next visitor gets the new content, not the old page once more
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  // Pages prerendered while the portal was out of reach (every Docker build) hold no tags, so the tags alone would miss
  // them. Mark every page stale too; each is rebuilt on its next visit, not all at once.
  revalidatePath("/", "layout");
  // new or changed catalog and posts: tell Bing and the other IndexNow engines (switched off without INDEXNOW_KEY)
  if (tags.some((t) => t === "posts" || t === "catalog")) after(() => autoSubmit().catch(() => undefined));
  return Response.json({ revalidated: tags });
}
