import { jsonBody, portalCall } from "@/lib/portal-call";

/**
 * Online payment of an order (Nomod), passed on to the portal, which alone holds the payment key:
 * { action: "check" | "retry", number, token } from the order page, { action: "test", id, result } from the
 * test-payment page (only answered while the portal runs with a dummy key).
 */
export async function POST(req: Request) {
  const body = await jsonBody(req, 2_000);
  if (!body) return Response.json({ error: "Not a valid payment request" }, { status: 400 });
  const { status, data } = await portalCall("/orders/payment", { method: "POST", body, req });
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
