import { siteFiles } from "@/lib/website/media";
import { publicMediaFile } from "@/lib/website/site-catalog";
import { guardSite } from "@/lib/website/site-key";

/** A picture uploaded in the Website app (site_media). Files app uploads are never reachable from here. */
export async function GET(req: Request, ctx: RouteContext<"/api/site/media/[id]">) {
  const denied = guardSite(req);
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const f = Number.isInteger(id) && id > 0 ? await publicMediaFile(id) : null;
  if (!f || !f.mime.startsWith("image/")) return new Response("Not found", { status: 404 });
  try {
    const data = await siteFiles.read(f.storedName);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": f.mime, "Content-Length": String(data.length), "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Gone", { status: 410 });
  }
}
