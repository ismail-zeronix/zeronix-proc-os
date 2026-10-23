import { getSession } from "@/lib/auth/session";
import { BRAND_ASSETS, type BrandAsset, getBrandAsset } from "@/lib/brand";

/** The white logo, signature or stamp image for customer documents. Signed-in staff only (the PDF is made as them). */
export async function GET(_req: Request, ctx: RouteContext<"/api/brand/asset/[kind]">) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const kind = (await ctx.params).kind;
  if (!(BRAND_ASSETS as readonly string[]).includes(kind)) return new Response(null, { status: 404 });
  const img = await getBrandAsset(kind as BrandAsset);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
