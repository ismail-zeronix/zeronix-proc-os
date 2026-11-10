/**
 * Filtering and sorting of a category list, shared by the category page and site /api/products (load on scroll), so
 * both show the same order. Sorting is by the public price incl. VAT; products without one (price on request) go last.
 */
export const SORTS = [
  { id: "", label: "Recommended" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export function sortOf(v: string | null | undefined): SortId {
  return SORTS.some((s) => s.id === v) ? (v as SortId) : "";
}

type Listed = { brandSlug: string; industries: string[]; price: string | null; priceMode: string };

export function listProducts<T extends Listed>(products: T[], f: { brand?: string | null; industry?: string | null; sort?: SortId }): T[] {
  const out = products.filter((p) => (!f.brand || p.brandSlug === f.brand) && (!f.industry || p.industries.includes(f.industry)));
  if (!f.sort) return out;
  const dir = f.sort === "price-asc" ? 1 : -1;
  const priceOf = (p: T) => (p.priceMode === "public" && p.price ? Number(p.price) : null);
  // Array.prototype.sort is stable, so equal prices keep the recommended order
  return [...out].sort((a, b) => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
    return (pa - pb) * dir;
  });
}
