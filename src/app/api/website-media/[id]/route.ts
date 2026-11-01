import { hasApp } from "@/lib/auth/session";
import { siteFiles } from "@/lib/website/media";
import { publicMediaFile } from "@/lib/website/site-catalog";

/** Previews of site pictures inside the portal (Website app). The public site gets them through /api/site/media. */
export async function GET(_req: Request, ctx: RouteContext<"/api/website-media/[id]">) {
  if (!(await hasApp("website"))) return new Response("Unauthorized", { status: 401 });
  const id = Number((await ctx.params).id);
  const f = Number.isInteger(id) && id > 0 ? await publicMediaFile(id) : null;
  if (!f || !f.mime.startsWith("image/")) return new Response("Not found", { status: 404 });
  try {
    const data = await siteFiles.read(f.storedName);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Gone", { status: 410 });
  }
}
