/**
 * Pictures uploaded in the portal's Website app, served from the site's own address (visitors never see the portal).
 * Read over site-net with the site key, cached by browsers and the image optimiser for a day.
 */
export async function GET(_req: Request, ctx: RouteContext<"/media/[id]">) {
  const id = (await ctx.params).id;
  const base = process.env.PORTAL_INTERNAL_URL;
  const key = process.env.SITE_API_KEY;
  if (!/^\d{1,10}$/.test(id) || !base || !key) return new Response("Not found", { status: 404 });
  const res = await fetch(`${base.replace(/\/$/, "")}/api/site/media/${id}`, { headers: { "x-site-key": key }, cache: "no-store" }).catch(() => null);
  if (!res?.ok || !res.body) return new Response("Not found", { status: res?.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
