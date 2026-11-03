import { z } from "zod";
import { allow } from "@/lib/webchat/public";
import { guardSite, siteJson } from "@/lib/website/site-key";
import { StoreProblem, verifyLoginCode } from "@/lib/website/store";

/** Checks a sign-in code and returns the customer token the site keeps in its httpOnly cookie. */
export async function POST(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const ip = req.headers.get("x-visitor-ip") ?? "unknown";
  if (!allow(`site-verify:${ip}`, 20, 60 * 60_000)) return siteJson({ error: "Too many tries from your network. Please try again later." }, 429);
  const body = z.object({ email: z.email().max(200), code: z.string().trim().regex(/^\d{6}$/, "The code has 6 digits") }).safeParse(await req.json().catch(() => null));
  if (!body.success) return siteJson({ error: body.error.issues[0]?.message ?? "Please check the code" }, 400);
  try {
    const { token } = await verifyLoginCode(body.data.email, body.data.code);
    return siteJson({ token });
  } catch (e) {
    if (e instanceof StoreProblem) return siteJson({ error: e.message }, e.status);
    throw e;
  }
}
