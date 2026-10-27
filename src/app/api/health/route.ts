/**
 * Liveness for Docker and uptime monitors: answers as soon as the server runs, touches nothing else.
 * Public by design, reveals nothing. The database check is /api/health/db.
 */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
