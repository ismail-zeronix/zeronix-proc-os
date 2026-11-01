import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteDb, siteSchema } from "@/db/site";
import { slugify } from "./markdown";

/**
 * Bylines. A post points at a ZeronixOS user (sitePosts.authorUserId); the public side of that person (name, title,
 * bio, photo) is their site_authors row in the website database, made from the user the first time they write.
 */

const A = siteSchema.siteAuthors;

/** Makes sure the user has an author row (name and job title copied from their portal profile). */
export async function ensureAuthor(userId: number): Promise<void> {
  const [has] = await siteDb.select({ id: A.id }).from(A).where(eq(A.portalUserId, userId));
  if (has) return;
  const [u] = await db.select({ name: schema.users.name, jobTitle: schema.users.jobTitle }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return;
  const base = slugify(u.name) || `author-${userId}`;
  const taken = new Set((await siteDb.select({ slug: A.slug }).from(A)).map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  await siteDb.insert(A).values({ portalUserId: userId, slug, name: u.name, jobTitle: u.jobTitle }).onConflictDoNothing();
}

/** Portal user names by id (revision history, "published by"), read from the ZeronixOS database. */
export async function userNames(ids: (number | null)[]): Promise<Map<number, string>> {
  const want = [...new Set(ids.filter((x): x is number => typeof x === "number"))];
  if (!want.length) return new Map();
  const rows = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, want));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Who can be named as a post's author: active portal users. */
export async function authorOptions() {
  return db.select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(schema.users.name);
}
