import { z } from "zod";
import { allow } from "@/lib/webchat/public";
import { setTestResult } from "@/lib/website/nomod";
import { guardSite, siteJson } from "@/lib/website/site-key";
import { paymentStatus, retryPayment, StoreProblem } from "@/lib/website/store";

/**
 * Online payment of a web order, passed on by the site's /api/order/payment. The order number comes with the token
 * from the return link (store.ts payToken).
 *   check  → where the payment stands (asks Nomod; the redirect alone never marks an order paid)
 *   retry  → a fresh Nomod checkout link for an unpaid order
 *   test   → test mode only (dummy key): the result clicked on the site's test-payment page
 */
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), number: z.string().max(20), token: z.string().max(64) }),
  z.object({ action: z.literal("retry"), number: z.string().max(20), token: z.string().max(64) }),
  z.object({ action: z.literal("test"), id: z.string().max(80), result: z.enum(["paid", "cancelled", "expired"]) }),
]);

export async function POST(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const ip = req.headers.get("x-visitor-ip") ?? "unknown";
  if (!allow(`site-pay:${ip}`, 60, 60 * 60_000)) return siteJson({ error: "Too many tries. Please call us." }, 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return siteJson({ error: "Not a valid payment request" }, 400);
  const v = parsed.data;
  try {
    if (v.action === "test") return setTestResult(v.id, v.result) ? siteJson({ ok: true }) : siteJson({ error: "Not a test payment" }, 404);
    if (v.action === "retry") return siteJson(await retryPayment(v.number, v.token));
    return siteJson(await paymentStatus(v.number, v.token));
  } catch (e) {
    if (e instanceof StoreProblem) return siteJson({ error: e.message }, e.status);
    throw e;
  }
}
