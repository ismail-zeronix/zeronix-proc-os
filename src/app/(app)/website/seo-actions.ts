"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { deleteKeyword, importKeywords, setKeywordStatus } from "@/lib/website/keywords";
import { parseInput } from "@/lib/user-error";

/** Website › SEO: import the keyword plan, move a keyword along, or drop it. Anyone with the Website app. */

export async function importKeywordsAction(form: FormData): Promise<Result<{ added: number; updated: number; skipped: number }>> {
  return attempt(async () => {
    await assertApp("website");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Problem("Choose a .csv file");
    if (file.size > 2 * 1024 * 1024) throw new Problem("The file can be up to 2 MB");
    const res = await importKeywords(await file.text());
    if (!res.added && !res.updated) throw new Problem("No keywords found. The file needs a column named \"keyword\".");
    revalidatePath("/website/seo");
    return res;
  });
}

const statusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["idea", "planned", "writing", "draft", "published"]),
  plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function setKeywordStatusAction(input: z.infer<typeof statusSchema>): Promise<Result<null>> {
  return attempt(async () => {
    await assertApp("website");
    const v = parseInput(statusSchema, input);
    await setKeywordStatus(v.id, v.status, v.plannedFor);
    revalidatePath("/website/seo");
    return null;
  });
}

export async function deleteKeywordAction(id: number): Promise<Result<null>> {
  return attempt(async () => {
    await assertApp("website");
    await deleteKeyword(z.number().int().positive().parse(id));
    revalidatePath("/website/seo");
    return null;
  });
}
