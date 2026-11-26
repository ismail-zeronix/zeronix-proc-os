import { dubaiToday } from "@/lib/dates";
import { platformExport } from "@/platform/close";
import { loadPlatformAdmin } from "@/platform/session";

/** All of one organisation's data as a ZIP, for a platform admin (before closing it, or for an admin who cannot sign in). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await loadPlatformAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  const r = await platformExport(admin, id);
  const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organisation";
  return new Response(new Uint8Array(r.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-all-data-${dubaiToday()}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
