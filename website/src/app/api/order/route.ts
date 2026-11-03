import { jsonBody, portalCall } from "@/lib/portal-call";

/** Checkout posts here; bots that fill the hidden "website" field get a polite answer and nothing is ordered. */
export async function POST(req: Request) {
  const body = await jsonBody(req);
  if (!body) return Response.json({ error: "Please check the form." }, { status: 400 });
  if (typeof body.website === "string" && body.website.trim()) return Response.json({ number: "WEB-00000", total: "0.00", payment: "request" });
  delete body.website;
  const { status, data } = await portalCall("/orders", { method: "POST", body, req });
  return Response.json(data, { status });
}
