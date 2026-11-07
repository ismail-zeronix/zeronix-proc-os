import { NextResponse } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { claimExportJob } from "@/lib/export-jobs";

/** The browser tab that gets a yes downloads the file (or shows the failure); any other open tab stays quiet. */
export async function POST(_req: Request, ctx: RouteContext<"/api/exports/[id]/claim">) {
  const access = await loadAccess();
  if (!access) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const ok = Number.isInteger(id) && id > 0 && (await claimExportJob(access.user.id, id));
  return NextResponse.json({ ok });
}
