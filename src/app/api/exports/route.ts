import { NextResponse, type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { addExportJob, MAX_ACTIVE_PER_PERSON, myExportJobs } from "@/lib/export-jobs";
import { isExportUrl } from "@/lib/export-urls";
import { currentOrgId } from "@/lib/org";

/** This person's files on their way and those ready to pick up. The browser asks this while it is waiting for one. */
export async function GET() {
  const access = await loadAccess();
  if (!access) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  return NextResponse.json({ jobs: await myExportJobs(access.user.id) }, { headers: { "Cache-Control": "no-store" } });
}

/** Puts a download in the line. The worker makes it; the answer is immediate. */
export async function POST(req: NextRequest) {
  const access = await loadAccess();
  if (!access) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { url?: unknown; label?: unknown } | null;
  if (!isExportUrl(body?.url)) return NextResponse.json({ error: "That cannot be downloaded." }, { status: 400 });
  const added = await addExportJob(access.user.id, await currentOrgId(), body.url, typeof body.label === "string" && body.label.trim() ? body.label.trim() : "Your file");
  if (!added) return NextResponse.json({ error: `You already have ${MAX_ACTIVE_PER_PERSON} files on their way. Wait for those first.` }, { status: 429 });
  return NextResponse.json({ id: added.job.id, ahead: added.ahead, duplicate: added.duplicate });
}
