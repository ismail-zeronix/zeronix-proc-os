import "server-only";
import JSZip from "jszip";
import { and, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { ensureAuthor, userNames } from "./authors";
import { saveSiteImage } from "./catalog";
import { postFromMarkdown, postPath, renderPostBody, seoChecks, type PostInput } from "./post-parse";
import { revalidateSite } from "./revalidate";
import type { SiteImage } from "./types";

/** Posts in the Website app: upload (.md or .zip), save with a revision and a fresh checklist, publish or schedule. */

const S = siteSchema.sitePosts;

/** Every path the site has right now (plus the fixed pages), for the internal-link check. */
export async function knownPaths(): Promise<Set<string>> {
  const set = new Set(["/", "/industries", "/products", "/services", "/guides", "/blog", "/quote", "/about", "/contact", "/privacy", "/terms", "/delivery-warranty"]);
  const [ind, cats, prods, brands, posts] = await Promise.all([
    siteDb.select({ slug: siteSchema.siteIndustries.slug }).from(siteSchema.siteIndustries),
    siteDb.select({ slug: siteSchema.siteCategories.slug }).from(siteSchema.siteCategories),
    siteDb.select({ slug: siteSchema.siteProducts.slug, cat: siteSchema.siteCategories.slug }).from(siteSchema.siteProducts).innerJoin(siteSchema.siteCategories, eq(siteSchema.siteCategories.id, siteSchema.siteProducts.categoryId)),
    siteDb.select({ slug: siteSchema.siteBrands.slug }).from(siteSchema.siteBrands),
    siteDb.select({ slug: S.slug, type: S.type }).from(S),
  ]);
  for (const x of ind) set.add(`/industries/${x.slug}`);
  for (const x of cats) set.add(`/products/${x.slug}`);
  for (const x of prods) set.add(`/products/${x.cat}/${x.slug}`);
  for (const x of brands) set.add(`/brands/${x.slug}`);
  for (const x of posts) set.add(postPath(x.type, x.slug));
  return set;
}

async function lookup() {
  const [industries, categories, products] = await Promise.all([
    siteDb.select({ id: siteSchema.siteIndustries.id, slug: siteSchema.siteIndustries.slug }).from(siteSchema.siteIndustries),
    siteDb.select({ id: siteSchema.siteCategories.id, slug: siteSchema.siteCategories.slug, name: siteSchema.siteCategories.name }).from(siteSchema.siteCategories),
    siteDb.select({ id: siteSchema.siteProducts.id, slug: siteSchema.siteProducts.slug, mpn: siteSchema.siteProducts.mpn }).from(siteSchema.siteProducts),
  ]);
  return { industries, categories, products };
}

async function checksFor(input: PostInput, id?: number) {
  const [taken] = await siteDb
    .select({ id: S.id })
    .from(S)
    .where(and(eq(S.slug, input.slug), id ? ne(S.id, id) : undefined))
    .limit(1);
  return seoChecks(input, { known: await knownPaths(), slugTaken: Boolean(taken) });
}

/** Saves a post (new or existing), renders its HTML, records a revision and refreshes the checklist. */
export async function savePost(input: PostInput, userId: number, id?: number, note = "Edited"): Promise<number> {
  const checks = await checksFor(input, id);
  await ensureAuthor(input.authorUserId ?? userId);
  const values = { ...input, bodyHtml: renderPostBody(input.body), seoChecks: checks, updatedAt: new Date() };
  return siteDb.transaction(async (tx) => {
    let postId = id;
    if (postId) await tx.update(S).set(values).where(eq(S.id, postId));
    else [{ id: postId }] = await tx.insert(S).values({ ...values, authorUserId: input.authorUserId ?? userId }).returning({ id: S.id });
    await tx.insert(siteSchema.sitePostRevisions).values({ postId: postId!, snapshot: { ...input } as Record<string, unknown>, note, userId });
    return postId!;
  });
}

/**
 * Upload from claude-seo: a .md, or a .zip with one .md and its pictures (images/…). Pictures are stored for the site
 * and their paths in the text and `cover:` are swapped for /media/<id>. A new slug becomes a draft written by the
 * uploader; an existing slug is updated in place (published posts stay published, with a revision to go back to).
 */
export async function importPost(file: File, userId: number): Promise<{ id: number; created: boolean; warnings: string[]; status: string }> {
  let text: string;
  const pictures = new Map<string, SiteImage>();
  if (/\.zip$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith("__MACOSX/"));
    const md = entries.filter((f) => /\.md$/i.test(f.name));
    if (md.length !== 1) throw new Error(md.length ? "The zip has more than one .md file; upload one post at a time" : "The zip has no .md file");
    text = await md[0].async("string");
    const base = md[0].name.includes("/") ? md[0].name.slice(0, md[0].name.lastIndexOf("/") + 1) : "";
    const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
    for (const e of entries.filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f.name)).slice(0, 30)) {
      const ext = e.name.split(".").pop()!.toLowerCase();
      const blob = new File([await e.async("arraybuffer")], e.name.split("/").pop()!, { type: types[ext] });
      const rel = e.name.startsWith(base) ? e.name.slice(base.length) : e.name;
      pictures.set(rel, await saveSiteImage(blob, "", userId));
    }
  } else {
    if (file.size > 1_000_000) throw new Error("That .md is too big (1 MB at most)");
    text = await file.text();
  }

  const { input, coverPath, coverAlt, warnings } = postFromMarkdown(text, await lookup());
  const find = (p: string) => pictures.get(p.replace(/^\.?\//, ""));
  // body image paths that came in the zip → the site's /media/<id>
  input.body = input.body.replace(/!\[([^\]]*)\]\(([^)\s]+)/g, (m, alt: string, src: string) => {
    const img = find(src);
    return img ? `![${alt}](/media/${img.fileId}` : m;
  });
  for (const [, src] of input.body.matchAll(/!\[[^\]]*\]\(([^)\s/][^)\s]*)/g)) if (!/^https?:/.test(src)) warnings.push(`Picture "${src}" was not in the upload; add it to the zip.`);
  if (coverPath) {
    const img = find(coverPath);
    if (img) input.cover = { fileId: img.fileId, alt: coverAlt || input.title };
    else warnings.push(`Cover "${coverPath}" was not in the upload.`);
  }

  const [existing] = await siteDb.select({ id: S.id, status: S.status, cover: S.cover, authorUserId: S.authorUserId }).from(S).where(eq(S.slug, input.slug)).limit(1);
  if (existing) {
    await savePost({ ...input, cover: input.cover ?? existing.cover, authorUserId: existing.authorUserId }, userId, existing.id, `Uploaded ${file.name}`);
    if (existing.status === "published") await revalidateSite(["posts"]);
    return { id: existing.id, created: false, warnings, status: existing.status };
  }
  const id = await savePost({ ...input, authorUserId: userId }, userId, undefined, `Uploaded ${file.name}`);
  return { id, created: true, warnings, status: "draft" };
}

/** One page of posts with a status, and how many there are in all. */
export async function listPosts(status?: string, page = 1, pageSize = 50) {
  const where = status ? eq(S.status, status as "draft") : undefined;
  const [{ total }] = await siteDb.select({ total: sql<number>`count(*)::int` }).from(S).where(where);
  const rows = await siteDb
    .select({
      id: S.id,
      type: S.type,
      slug: S.slug,
      title: S.title,
      status: S.status,
      publishAt: S.publishAt,
      publishedAt: S.publishedAt,
      updatedAt: S.updatedAt,
      author: siteSchema.siteAuthors.name,
      checks: S.seoChecks,
    })
    .from(S)
    .leftJoin(siteSchema.siteAuthors, eq(siteSchema.siteAuthors.portalUserId, S.authorUserId))
    .where(where)
    .orderBy(desc(S.updatedAt), desc(S.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total };
}

/** Publish, unpublish (draft) or archive many posts at once; the site is told once at the end. */
export async function bulkPostStatus(ids: number[], kind: "publish" | "unpublish" | "archive", userId: number): Promise<number> {
  if (!ids.length) return 0;
  const now = new Date();
  const rows =
    kind === "publish"
      ? await siteDb
          .update(S)
          .set({ status: "published", publishAt: null, publishedAt: sql`coalesce(${S.publishedAt}, now())`, publishedBy: userId, updatedAt: now })
          .where(inArray(S.id, ids))
          .returning({ id: S.id })
      : await siteDb
          .update(S)
          .set({ status: kind === "archive" ? "archived" : "draft", publishAt: null, updatedAt: now })
          .where(inArray(S.id, ids))
          .returning({ id: S.id });
  await revalidateSite(["posts", "catalog"]);
  return rows.length;
}

export async function postCounts(): Promise<Record<string, number>> {
  const rows = await siteDb.select({ status: S.status, n: sql<number>`count(*)::int` }).from(S).groupBy(S.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export async function getPost(id: number) {
  const [row] = await siteDb.select().from(S).where(eq(S.id, id));
  if (!row) return null;
  const list = await siteDb
    .select({ id: siteSchema.sitePostRevisions.id, note: siteSchema.sitePostRevisions.note, createdAt: siteSchema.sitePostRevisions.createdAt, userId: siteSchema.sitePostRevisions.userId })
    .from(siteSchema.sitePostRevisions)
    .where(eq(siteSchema.sitePostRevisions.postId, id))
    .orderBy(desc(siteSchema.sitePostRevisions.createdAt))
    .limit(30);
  const names = await userNames(list.map((r) => r.userId));
  const revisions = list.map(({ userId, ...r }) => ({ ...r, by: userId ? (names.get(userId) ?? null) : null }));
  return { ...row, revisions };
}

export async function revisionSnapshot(postId: number, revisionId: number): Promise<PostInput | null> {
  const [r] = await siteDb
    .select({ snapshot: siteSchema.sitePostRevisions.snapshot })
    .from(siteSchema.sitePostRevisions)
    .where(and(eq(siteSchema.sitePostRevisions.id, revisionId), eq(siteSchema.sitePostRevisions.postId, postId)));
  return (r?.snapshot as unknown as PostInput) ?? null;
}

export type PublishAction = { kind: "publish" } | { kind: "schedule"; at: Date } | { kind: "unpublish" } | { kind: "archive" };

/** Publish now, schedule, take off the site, or archive. The site is told at once (or by the worker at the scheduled time). */
export async function setPostStatus(id: number, action: PublishAction, userId: number): Promise<void> {
  const now = new Date();
  if (action.kind === "publish") {
    await siteDb
      .update(S)
      .set({ status: "published", publishAt: null, publishedAt: sql`coalesce(${S.publishedAt}, now())`, publishedBy: userId, updatedAt: now })
      .where(eq(S.id, id));
  } else if (action.kind === "schedule") {
    await siteDb.update(S).set({ status: "scheduled", publishAt: action.at, publishedBy: userId, updatedAt: now }).where(eq(S.id, id));
  } else {
    await siteDb.update(S).set({ status: action.kind === "archive" ? "archived" : "draft", publishAt: null, updatedAt: now }).where(eq(S.id, id));
  }
  await revalidateSite(["posts", "catalog"]);
}

/** Worker: publishes scheduled posts whose time has come. */
export async function publishDuePosts(): Promise<number> {
  const due = await siteDb
    .update(S)
    .set({ status: "published", publishedAt: sql`coalesce(${S.publishedAt}, ${S.publishAt})`, updatedAt: new Date() })
    .where(and(eq(S.status, "scheduled"), lte(S.publishAt, new Date())))
    .returning({ id: S.id });
  if (due.length) await revalidateSite(["posts", "catalog"]);
  return due.length;
}

export { authorOptions } from "./authors";
