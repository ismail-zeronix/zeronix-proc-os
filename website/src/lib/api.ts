import { connection } from "next/server";
import "server-only";
import {
  CONTRACT_VERSION,
  type SiteAuthorPage,
  type SiteBrandPage,
  type SiteCategoriesResponse,
  type SiteCategoryPage,
  type SiteCompareResponse,
  type SiteIndustriesResponse,
  type SiteIndustryPage,
  type SiteNavResponse,
  type SitePostPage,
  type SitePostsResponse,
  type SiteProductPage,
  type SiteProductsResponse,
  type SiteSearchResponse,
  type SiteSettingsResponse,
  type SiteLlmsResponse,
  type SiteSitemapResponse,
} from "./contract";
import { BRAND_FALLBACK, HOME_FALLBACK } from "./defaults";

/**
 * The only place the site talks to the portal: GET /api/site/* over the internal network (PORTAL_INTERNAL_URL) with the
 * shared SITE_API_KEY. Answers are cached (ISR) and tagged; the portal calls /api/revalidate with the tags after a
 * publish ("settings", "nav", "catalog").
 *
 * When the portal cannot be reached the fallback must never be cached as the page: `connection()` stops prerendering, so
 * a Docker build (no portal) leaves the pages to be rendered on request from the cached portal data, and a failed
 * background refresh during an outage keeps serving the last good page instead of replacing it with an empty one.
 */

const REVALIDATE_SECONDS = 600;

type Got<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

async function fetchPortal<T extends { contract: number }>(path: string, tags: string[]): Promise<Got<T>> {
  const base = process.env.PORTAL_INTERNAL_URL;
  const key = process.env.SITE_API_KEY;
  if (!base || !key) return { ok: false, notFound: false };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/site${path}`, {
      headers: { "x-site-key": key },
      next: { revalidate: REVALIDATE_SECONDS, tags },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return { ok: false, notFound: true };
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    const data = (await res.json()) as T;
    if (data.contract !== CONTRACT_VERSION) console.warn(`[site] portal speaks contract ${data.contract}, site expects ${CONTRACT_VERSION}`);
    return { ok: true, data };
  } catch (e) {
    console.error("[site] portal unavailable:", (e as Error).message);
    return { ok: false, notFound: false };
  }
}

/** Data every page needs (settings, menus): the fallback keeps the page up while the portal is away. */
async function get<T extends { contract: number }>(path: string, tags: string[], fallback: T): Promise<T> {
  const got = await fetchPortal<T>(path, tags);
  if (got.ok) return got.data;
  // outside any try: connection() signals Next.js by throwing during a prerender, which must not be swallowed
  await connection();
  return fallback;
}

/** One record (a product, an industry): null = it does not exist (or is not published), so the page 404s. */
async function getOne<T extends { contract: number }>(path: string, tags: string[]): Promise<T | null> {
  const got = await fetchPortal<T>(path, tags);
  if (got.ok) return got.data;
  if (got.notFound) return null;
  await connection();
  throw new Error("The catalog is unavailable right now. Please try again in a moment.");
}

const enc = encodeURIComponent;

export const getSettings = () => get<SiteSettingsResponse>("/settings", ["settings"], { contract: CONTRACT_VERSION, brand: BRAND_FALLBACK, home: HOME_FALLBACK });
export const getNav = () => get<SiteNavResponse>("/nav", ["nav"], { contract: CONTRACT_VERSION, industries: [], categories: [], brands: [] });
export const getIndustries = () => get<SiteIndustriesResponse>("/industries", ["catalog"], { contract: CONTRACT_VERSION, industries: [] });
export const getProducts = (q: { category?: string; limit?: number } = {}) => {
  const p = new URLSearchParams();
  if (q.category) p.set("category", q.category);
  if (q.limit) p.set("limit", String(q.limit));
  return get<SiteProductsResponse>(`/products?${p}`, ["catalog"], { contract: CONTRACT_VERSION, products: [] });
};
export const getSearch = (q: string) => get<SiteSearchResponse>(`/search?q=${enc(q)}`, ["catalog", "posts"], { contract: CONTRACT_VERSION, q, products: [], posts: [] });
export const getCategories = () => get<SiteCategoriesResponse>("/categories", ["catalog"], { contract: CONTRACT_VERSION, categories: [] });
export const getIndustry = (slug: string) => getOne<SiteIndustryPage>(`/industries/${enc(slug)}`, ["catalog"]);
export const getCategory = (slug: string) => getOne<SiteCategoryPage>(`/categories/${enc(slug)}`, ["catalog"]);
export const getProduct = (slug: string) => getOne<SiteProductPage>(`/products/${enc(slug)}`, ["catalog"]);
export const getBrand = (slug: string) => getOne<SiteBrandPage>(`/brands/${enc(slug)}`, ["catalog"]);
export const getCompare = (slugs: string[]) => getOne<SiteCompareResponse>(`/compare?p=${slugs.map(enc).join(",")}`, ["catalog"]);

export const getPosts = (q: { kind?: "guides" | "articles" | "services"; industry?: string; category?: string; author?: string; page?: number }) => {
  const p = new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (v ? [[k, String(v)]] : [])));
  return get<SitePostsResponse>(`/posts?${p}`, ["posts"], { contract: CONTRACT_VERSION, posts: [], total: 0 });
};
export const getPost = (slug: string) => getOne<SitePostPage>(`/posts/${enc(slug)}`, ["posts", "catalog"]);
export const getAuthor = (slug: string) => getOne<SiteAuthorPage>(`/authors/${enc(slug)}`, ["posts"]);
export const getSitemap = () => get<SiteSitemapResponse>("/sitemap", ["posts", "catalog"], { contract: CONTRACT_VERSION, entries: [] });
export const getLlms = () => get<SiteLlmsResponse>("/llms", ["posts", "catalog"], { contract: CONTRACT_VERSION, industries: [], categories: [], brands: [], products: [], posts: [] });
