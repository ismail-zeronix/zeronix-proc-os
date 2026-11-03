"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteDb, siteSchema } from "@/db/site";
import { eq } from "drizzle-orm";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { POST_TYPES, renderPostBody, type PostInput } from "@/lib/website/post-parse";
import { bulkPostStatus, importPost, revisionSnapshot, savePost, setPostStatus } from "@/lib/website/posts";
import { revalidateSite } from "@/lib/website/revalidate";

/** Guides and blog posts in the Website app. Anyone with the app may upload, edit and publish; only admins change the byline. */

const text = (max: number) => z.string().trim().max(max);

const postSchema = z.object({
  type: z.enum(POST_TYPES),
  slug: text(90).regex(/^[a-z0-9-]+$/, "A web address may only use lowercase letters, digits and dashes"),
  title: text(160).min(3, "Enter a title"),
  metaTitle: text(90),
  metaDescription: text(300),
  excerpt: text(400),
  body: text(200_000),
  primaryKeyword: text(120),
  keywords: z.array(text(120)).max(20),
  category: text(80),
  tags: z.array(text(60)).max(12),
  industryId: z.number().int().positive().nullable(),
  categoryId: z.number().int().positive().nullable(),
  products: z
    .array(z.object({ productId: z.number().int().positive(), rank: z.number().int().min(0), label: text(60), verdict: text(600), pros: z.array(text(200)).max(6), cons: z.array(text(200)).max(6) }))
    .max(12),
  faq: z.array(z.object({ q: text(300).min(1), a: text(2000).min(1) })).max(20),
  schema: z.record(z.string(), z.unknown()).nullable(),
  cover: z.object({ fileId: z.number().int().positive(), alt: text(300) }).nullable(),
  ctaText: text(120),
  authorUserId: z.number().int().positive().nullable(),
  reviewNotes: text(2000),
});

function refresh(id?: number) {
  revalidatePath("/website/content", "layout");
  if (id) revalidatePath(`/website/content/${id}`);
}

/** Upload a .md or .zip (FormData: file). */
export async function importPostAction(form: FormData): Promise<Result<{ id: number; created: boolean; warnings: string[]; status: string }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Problem("Choose a .md or .zip file");
    if (file.size > 40 * 1024 * 1024) throw new Problem("The upload can be up to 40 MB");
    const res = await importPost(file, me.id).catch((e: Error) => {
      throw new Problem(e.message);
    });
    refresh(res.id);
    return res;
  });
}

export async function savePostAction(input: PostInput, id?: number): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const data = postSchema.parse(input) as PostInput;
    if (id && me.role !== "admin") {
      const [cur] = await siteDb.select({ author: siteSchema.sitePosts.authorUserId, status: siteSchema.sitePosts.status }).from(siteSchema.sitePosts).where(eq(siteSchema.sitePosts.id, id));
      data.authorUserId = cur?.author ?? me.id;
    }
    const saved = await savePost(data, me.id, id).catch((e: { code?: string }) => {
      if (e.code === "23505") throw new Problem("Another post already uses this web address. Change the slug.");
      throw e;
    });
    const [row] = await siteDb.select({ status: siteSchema.sitePosts.status }).from(siteSchema.sitePosts).where(eq(siteSchema.sitePosts.id, saved));
    if (row?.status === "published") await revalidateSite(["posts"]);
    refresh(saved);
    return saved;
  });
}

/** Publish now, schedule (ISO time), take off the site, or archive. */
export async function setPostStatusAction(id: number, kind: "publish" | "schedule" | "unpublish" | "archive", at?: string): Promise<Result<undefined>> {
  return attempt(async () => {
    const me = await assertApp("website");
    if (kind === "schedule") {
      const when = new Date(at ?? "");
      if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) throw new Problem("Pick a time in the future");
      await setPostStatus(id, { kind, at: when }, me.id);
    } else await setPostStatus(id, { kind }, me.id);
    refresh(id);
    return undefined;
  });
}

/** Publish, unpublish or archive the posts ticked in the Content list. */
export async function bulkPostStatusAction(ids: number[], kind: "publish" | "unpublish" | "archive"): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const n = await bulkPostStatus(z.array(z.number().int().positive()).max(500).parse(ids), z.enum(["publish", "unpublish", "archive"]).parse(kind), me.id);
    revalidatePath("/website", "layout");
    return n;
  });
}

/** The editor's preview: the same HTML the site will show (shortcodes appear as placeholders). */
export async function previewPostAction(body: string): Promise<string> {
  await assertApp("website");
  return renderPostBody(body.slice(0, 200_000)).replace(/<p>@@sc:(\w+):([^@]*)@@<\/p>/g, (_, k: string, a: string) => `<p class="shortcode">[${k}${a ? `: ${decodeURIComponent(a)}` : ""}]</p>`);
}

export async function restoreRevisionAction(id: number, revisionId: number): Promise<Result<undefined>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const snap = await revisionSnapshot(id, revisionId);
    if (!snap) throw new Problem("That version is no longer there");
    await savePost(snap, me.id, id, "Restored an earlier version");
    refresh(id);
    return undefined;
  });
}

/** "New post": an empty draft written in the portal by the person who clicked. */
export async function newPostAction(): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const slug = `draft-${Date.now().toString(36)}`;
    const id = await savePost(
      { type: "article", slug, title: "Untitled post", metaTitle: "", metaDescription: "", excerpt: "", body: "", primaryKeyword: "", keywords: [], category: "", tags: [], industryId: null, categoryId: null, products: [], faq: [], schema: null, cover: null, ctaText: "", authorUserId: me.id, reviewNotes: "" },
      me.id,
      undefined,
      "Created",
    );
    refresh(id);
    return id;
  });
}
