import { NextResponse } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { exportFile } from "@/lib/export-jobs";

/** A finished file, only for the person who asked. Kept for a day, so it can be fetched again in that time. */
export async function GET(_req: Request, ctx: RouteContext<"/api/exports/[id]/file">) {
  const access = await loadAccess();
  if (!access) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const found = Number.isInteger(id) && id > 0 ? await exportFile(access.user.id, id).catch(() => null) : null;
  if (!found) return NextResponse.json({ error: "That file is no longer here. Download it again." }, { status: 404 });
  const name = found.job.fileName ?? "download";
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new NextResponse(new Uint8Array(found.data), {
    headers: {
      "Content-Type": found.job.contentType ?? "application/octet-stream",
      "Content-Length": String(found.data.length),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
