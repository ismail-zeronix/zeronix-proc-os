import { getSession } from "@/lib/auth/session";
import { getLogo, brandCacheControl } from "@/lib/brand";

/** The company logo, for previews inside the portal (sent emails carry the logo as an attachment instead). */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const logo = await getLogo();
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: { "Content-Type": logo.mime, "Cache-Control": brandCacheControl(req), "X-Content-Type-Options": "nosniff" },
  });
}
