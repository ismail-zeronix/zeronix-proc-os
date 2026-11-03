import { cookies } from "next/headers";
import { CUSTOMER_COOKIE, jsonBody, portalCall } from "@/lib/portal-call";

/**
 * Customer account, all through the portal:
 * GET = profile and orders (401 when not signed in), PUT = save the profile,
 * POST {action: "code", email} = email a sign-in code, POST {action: "verify", email, code} = sign in (sets the cookie),
 * POST {action: "logout"} = sign out.
 */

export async function GET(req: Request) {
  const { status, data } = await portalCall("/account/me", { req });
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const body = await jsonBody(req);
  if (!body) return Response.json({ error: "Please check the form." }, { status: 400 });
  const { status, data } = await portalCall("/account/me", { method: "PUT", body, req });
  return Response.json(data, { status });
}

export async function POST(req: Request) {
  const body = await jsonBody(req, 2000);
  if (!body) return Response.json({ error: "Please check the form." }, { status: 400 });
  const jar = await cookies();
  if (body.action === "logout") {
    jar.delete(CUSTOMER_COOKIE);
    return Response.json({ ok: true });
  }
  if (body.action === "code") {
    const { status, data } = await portalCall("/account/code", { method: "POST", body: { email: body.email }, req });
    return Response.json(data, { status });
  }
  if (body.action === "verify") {
    const { status, data } = await portalCall("/account/verify", { method: "POST", body: { email: body.email, code: body.code }, req });
    if (status === 200 && typeof data.token === "string") {
      jar.set(CUSTOMER_COOKIE, data.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
      return Response.json({ ok: true });
    }
    return Response.json(data, { status });
  }
  return Response.json({ error: "Unknown request." }, { status: 400 });
}
