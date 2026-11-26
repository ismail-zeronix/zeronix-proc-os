"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { addGapIdeas, checkRanks, competitorGap, fillVolumes, saveDfs, testDfs } from "@/lib/website/dataforseo";
import { parseDomains } from "@/lib/website/dataforseo-core";
import { parseInput } from "@/lib/user-error";

/**
 * Website › Settings › DataForSEO and the paid buttons on Website › SEO. Admins only: every button spends money (within
 * the monthly budget). Library errors are rethrown as Problem so production builds show their message.
 */

async function admin() {
  const me = await assertApp("website");
  if (me.role !== "admin") throw new Problem("Only an admin can use DataForSEO (it is paid per call).");
  return me;
}

const asProblem = (e: unknown): never => {
  throw new Problem((e as Error).message);
};

const saveSchema = z.object({
  login: z.string().trim().max(200),
  password: z.string().max(200),
  budgetUsd: z.number().min(0, "The budget cannot be negative").max(1000, "Keep the monthly budget under USD 1,000"),
  competitors: z.string().max(2000),
});

export async function saveDfsAction(input: z.infer<typeof saveSchema>): Promise<Result<{ competitors: number }>> {
  return attempt(async () => {
    const me = await admin();
    const v = parseInput(saveSchema, input);
    const saved = await saveDfs({ ...v, competitors: parseDomains(v.competitors) }, me.id).catch(asProblem);
    revalidatePath("/website/settings");
    return { competitors: saved.competitors.length };
  });
}

export async function testDfsAction(): Promise<Result<{ balance: number | null }>> {
  return attempt(async () => {
    await admin();
    return testDfs().catch(asProblem);
  });
}

export async function fillVolumesAction(): Promise<Result<{ updated: number; asked: number }>> {
  return attempt(async () => {
    await admin();
    const res = await fillVolumes().catch(asProblem);
    revalidatePath("/website/seo");
    return res;
  });
}

/** Starts a ranking check in the background (one call per keyword takes minutes); results show on the next page load. */
export async function checkRanksAction(): Promise<Result<{ started: true }>> {
  return attempt(async () => {
    await admin();
    await testDfs().catch(asProblem); // fail fast on a bad login before going to the background
    void checkRanks()
      .then((r) => console.log(`[website] ranking check: ${r.checked} keyword(s)${r.stopped ? ", stopped at the budget" : ""}`))
      .catch((e: Error) => console.error("[website] ranking check failed:", e.message));
    return { started: true as const };
  });
}

export async function competitorGapAction(): Promise<Result<{ rows: number }>> {
  return attempt(async () => {
    await admin();
    const rows = await competitorGap().catch(asProblem);
    revalidatePath("/website/seo");
    return { rows: rows.length };
  });
}

export async function addGapIdeasAction(keywords: string[]): Promise<Result<{ added: number }>> {
  return attempt(async () => {
    await admin();
    const list = z.array(z.string().trim().min(1).max(200)).max(200).parse(keywords);
    const added = await addGapIdeas(list).catch(asProblem);
    revalidatePath("/website/seo");
    return { added };
  });
}
