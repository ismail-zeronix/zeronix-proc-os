import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { hasApp, loadAccess } from "@/lib/auth/session";
import { canSeeFile, financeViewerOf } from "@/lib/auth/visibility";
import { extOf, INLINE_EXT } from "@/lib/file-folders";
import { readStoredFile } from "@/lib/files-store";

/** Opens (PDF, images) or downloads a shared file. `?download=1` always downloads. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  if (!(await hasApp("files"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [f] = await db.select().from(schema.files).where(eq(schema.files.id, id));
  const access = await loadAccess();
  // a file linked to someone else's deal reads like a file that does not exist
  if (!f || !access || !(await canSeeFile(financeViewerOf(access), f.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let data: Buffer;
  try {
    data = await readStoredFile(f.storedName);
  } catch {
    return NextResponse.json({ error: "The file is missing on the server." }, { status: 410 });
  }
  const inline = INLINE_EXT.has(extOf(f.name)) && req.nextUrl.searchParams.get("download") !== "1";
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
