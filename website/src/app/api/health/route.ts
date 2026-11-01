/** Docker healthcheck and the portal's "Site reachable" check. Says nothing about the portal itself. */
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const dynamic = "force-dynamic";
