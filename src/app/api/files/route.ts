import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { isPunchedIn, loadAccess, NOT_PUNCHED_IN } from "@/lib/auth/session";
import { ALLOWED_TYPES, extOf, isFolder, isRelatedType, MAX_FILE_BYTES, sizeLabel } from "@/lib/file-folders";
import { saveFile } from "@/lib/files-store";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Uploads one or more files into the shared Files app (multipart: `file` (repeatable), `folder`, `notes`, and optionally
 * `relatedType` + `relatedId` to show them on a company, deal, order or invoice too).
 */
export async function POST(req: NextRequest) {
  const access = await loadAccess();
  if (!access || !access.apps.includes("files")) return fail("You do not have access to Files.", 401);
  if (!(await isPunchedIn(access.user.id))) return fail(NOT_PUNCHED_IN, 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload the files as multipart form data.", 400);
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail("Choose a file.", 400);
  if (files.length > 20) return fail("Upload at most 20 files at a time.", 400);
  const folder = String(form.get("folder") ?? "other");
  if (!isFolder(folder)) return fail("Pick a folder.", 400);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 500);
  const relType = String(form.get("relatedType") ?? "");
  const relId = Number(form.get("relatedId") ?? 0);
  const related = relType && isRelatedType(relType) && Number.isInteger(relId) && relId > 0 ? { relatedType: relType, relatedId: relId } : {};

  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return fail(`"${f.name}" is ${sizeLabel(f.size)}. The limit is ${sizeLabel(MAX_FILE_BYTES)} per file.`, 413);
    if (!ALLOWED_TYPES[extOf(f.name)]) return fail(`"${f.name}" is not a type the portal keeps (PDF, images, Word, Excel, PowerPoint, CSV, text, zip, email).`, 415);
  }

  const saved = [];
  for (const f of files) {
    const ext = extOf(f.name);
    const storedName = await saveFile(Buffer.from(await f.arrayBuffer()), ext);
    const [row] = await db
      .insert(schema.files)
      .values({
        name: f.name.replace(/[\/\r\n]/g, "_").slice(0, 200),
        storedName,
        mime: ALLOWED_TYPES[ext],
        size: f.size,
        folder,
        notes,
        ...related,
        uploadedBy: access.user.id,
      })
      .returning({ id: schema.files.id, name: schema.files.name });
    saved.push(row);
  }
  return NextResponse.json({ files: saved });
}
