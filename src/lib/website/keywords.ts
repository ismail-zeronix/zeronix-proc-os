import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { keywordsFromCsv } from "./keyword-csv";
import { postPath } from "./post-parse";

/**
 * The SEO plan (Website › SEO): keywords grouped in clusters, each aimed at one page and given a date. A keyword whose
 * target page is a published post counts as published, whatever its own status says.
 */

const K = siteSchema.siteKeywords;

/** Imports a CSV (our research file or a Keyword Planner export). An existing keyword is updated, not duplicated. */
export async function importKeywords(text: string): Promise<{ added: number; updated: number; skipped: number }> {
  const { rows, skipped } = keywordsFromCsv(text);
  if (!rows.length) return { added: 0, updated: 0, skipped };
  const [industries, categories, posts] = await Promise.all([
    siteDb.select({ id: siteSchema.siteIndustries.id, slug: siteSchema.siteIndustries.slug }).from(siteSchema.siteIndustries),
    siteDb.select({ id: siteSchema.siteCategories.id, slug: siteSchema.siteCategories.slug }).from(siteSchema.siteCategories),
    siteDb.select({ id: siteSchema.sitePosts.id, slug: siteSchema.sitePosts.slug, type: siteSchema.sitePosts.type }).from(siteSchema.sitePosts),
  ]);
  const existing = new Map(
    (
      await siteDb
        .select({ id: K.id, keyword: K.keyword })
        .from(K)
        .where(inArray(sql`lower(${K.keyword})`, rows.map((r) => r.keyword)))
    ).map((r) => [r.keyword.toLowerCase(), r.id]),
  );
  let added = 0;
  let updated = 0;
  await siteDb.transaction(async (tx) => {
    for (const r of rows) {
      const post = posts.find((p) => postPath(p.type, p.slug) === r.target);
      const values = {
        keyword: r.keyword,
        cluster: r.cluster,
        intent: r.intent,
        industryId: industries.find((x) => x.slug === r.industry)?.id ?? null,
        categoryId: categories.find((x) => x.slug === r.category)?.id ?? null,
        priority: r.priority,
        volume: r.volume,
        difficulty: r.difficulty,
        source: "csv" as const,
        targetPostId: post?.id ?? null,
        targetPath: r.target,
        status: r.status,
        plannedFor: r.plannedFor,
        notes: r.notes,
        updatedAt: new Date(),
      };
      const id = existing.get(r.keyword);
      if (id) {
        await tx.update(K).set(values).where(eq(K.id, id));
        updated++;
      } else {
        await tx.insert(K).values(values);
        added++;
      }
    }
  });
  return { added, updated, skipped };
}

export type KeywordStatus = "idea" | "planned" | "writing" | "draft" | "published";

export interface KeywordView {
  id: number;
  keyword: string;
  cluster: string;
  intent: string;
  industry: string | null;
  priority: number;
  volume: number | null;
  difficulty: number | null;
  targetPath: string;
  targetTitle: string | null;
  /** The post's own state wins: a published target page makes the keyword published. */
  status: KeywordStatus;
  plannedFor: string | null;
  notes: string;
}

export async function listKeywords(): Promise<KeywordView[]> {
  const P = siteSchema.sitePosts;
  const rows = await siteDb
    .select({ k: K, industry: siteSchema.siteIndustries.name, postTitle: P.title, postStatus: P.status, postSlug: P.slug, postType: P.type })
    .from(K)
    .leftJoin(siteSchema.siteIndustries, eq(siteSchema.siteIndustries.id, K.industryId))
    .leftJoin(P, eq(P.id, K.targetPostId))
    .orderBy(asc(K.priority), asc(K.cluster), asc(K.keyword));
  // a target path may name a post uploaded after the import: match it by path too
  const loose = rows.filter((r) => !r.k.targetPostId && r.k.targetPath).map((r) => r.k.targetPath.split("/").pop()!);
  const late = loose.length ? await siteDb.select({ slug: P.slug, type: P.type, title: P.title, status: P.status }).from(P).where(inArray(P.slug, loose)) : [];
  return rows.map(({ k, industry, postTitle, postStatus }) => {
    const post = postTitle ? { title: postTitle, status: postStatus } : late.find((p) => postPath(p.type, p.slug) === k.targetPath);
    const status: KeywordStatus = post?.status === "published" ? "published" : post && k.status !== "published" && ["idea", "planned", "writing"].includes(k.status) ? "draft" : k.status;
    return {
      id: k.id,
      keyword: k.keyword,
      cluster: k.cluster || "Not grouped",
      intent: k.intent,
      industry,
      priority: k.priority,
      volume: k.volume,
      difficulty: k.difficulty,
      targetPath: k.targetPath,
      targetTitle: post?.title ?? null,
      status,
      plannedFor: k.plannedFor,
      notes: k.notes,
    };
  });
}

export async function setKeywordStatus(id: number, status: KeywordStatus, plannedFor: string | null) {
  await siteDb.update(K).set({ status, plannedFor, updatedAt: new Date() }).where(eq(K.id, id));
}

export async function deleteKeyword(id: number) {
  await siteDb.delete(K).where(eq(K.id, id));
}
