import { z } from "zod";
import { allow } from "@/lib/webchat/public";
import { guardSite, siteJson } from "@/lib/website/site-key";
import { sendLoginCode, StoreProblem } from "@/lib/website/store";

/** Emails a sign-in code. Limited per visitor IP here and per email in sendLoginCode. */
export async function POST(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const ip = req.headers.get("x-visitor-ip") ?? "unknown";
  if (!allow(`site-code:${ip}`, 8, 60 * 60_000)) return siteJson({ error: "Too many tries from your network. Please try again later." }, 429);
  const body = z.object({ email: z.email("Please enter a valid email address").max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return siteJson({ error: body.error.issues[0]?.message ?? "Please enter your email" }, 400);
  try {
    await sendLoginCode(body.data.email);
    return siteJson({ ok: true });
  } catch (e) {
    if (e instanceof StoreProblem) return siteJson({ error: e.message }, e.status);
    console.error("[store] sign-in code email failed:", (e as Error).message);
    return siteJson({ error: "We could not send the code right now. Please try again in a moment." }, 502);
  }
}
