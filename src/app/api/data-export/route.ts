import { db } from "@/db";
import { audit } from "@/lib/audit";
import { loadAccess } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand";
import { dubaiToday } from "@/lib/dates";
import { zeronixFeatures } from "@/lib/edition";
import { buildOrgExport } from "@/lib/org-export";

/**
 * "Download all our data" (Admin › Settings › Your data, SaaS install): the whole organisation as a ZIP of CSV files and
 * its uploaded files. Admins only, never in a support visit. Made by the background download queue, as the admin, so
 * row-level security keeps it to their organisation.
 */
export async function GET() {
  if (zeronixFeatures()) return new Response("Not found", { status: 404 });
  const access = await loadAccess();
  if (!access || access.user.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (access.support) return Response.json({ error: "Not in a support visit" }, { status: 403 });
  const brand = await getBrand();
  const { zip, tables, rows, files } = await buildOrgExport(db, access.orgId, brand.company || "your company");
  await audit(db, { userId: access.user.id, action: "data.export", entity: "organization", entityId: access.orgId, summary: `All data downloaded: ${tables} tables, ${rows} rows, ${files} files` });
  const slug = (brand.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-all-data-${dubaiToday()}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
