"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp, loadAccess } from "@/lib/auth/session";
import { canSeeFile, financeViewerOf } from "@/lib/auth/visibility";
import { isFolder } from "@/lib/file-folders";
import { removeStoredFile } from "@/lib/files-store";

function refresh() {
  revalidatePath("/files");
  revalidatePath("/sales", "layout");
  revalidatePath("/accounts", "layout");
}

/** Only the person who uploaded a file, or an admin, can delete it. */
export async function deleteFile(id: number) {
  const me = await assertApp("files");
  const [f] = await db.select().from(schema.files).where(eq(schema.files.id, id));
  if (!f) return;
  if (f.uploadedBy !== me.id && me.role !== "admin") throw new Error("Only the person who uploaded this file, or an admin, can delete it.");
  await db.delete(schema.files).where(eq(schema.files.id, id));
  await removeStoredFile(f.storedName);
  refresh();
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Give the file a name").max(200).optional(),
  folder: z.string().refine(isFolder, "Pick a folder").optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Rename, move to another folder, or change the note. */
export async function updateFile(id: number, input: z.input<typeof editSchema>) {
  await assertApp("files");
  const access = await loadAccess();
  if (!access || !(await canSeeFile(financeViewerOf(access), id))) throw new Error("That file no longer exists.");
  const d = editSchema.parse(input);
  await db.update(schema.files).set(d).where(eq(schema.files.id, id));
  refresh();
}
