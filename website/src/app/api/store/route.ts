import { portalCall } from "@/lib/portal-call";

/** Checkout options: ways to pay, bank details, delivery note, and whether signing in is available. */
export async function GET(req: Request) {
  const { status, data } = await portalCall("/store", { req });
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
