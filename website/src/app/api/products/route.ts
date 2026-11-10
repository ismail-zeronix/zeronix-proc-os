import { NextResponse, type NextRequest } from "next/server";
import { getCategory, getProducts } from "@/lib/api";
import { listProducts, sortOf } from "@/lib/catalog-list";

/**
 * Product cards for loading on scroll (the browser never talks to the portal; this reads the same cached data the pages do).
 *
 * - `?category=laptops&limit=12`: newest cards of one category (home page shelves).
 * - `?category=laptops&page=2&per=24[&brand=hp][&industry=legal][&sort=price-asc]`: one page of a category list, filtered as the page is.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const category = q.get("category") ?? "";
  const page = Math.floor(Number(q.get("page")));
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" };

  if (!page) {
    const limit = Math.min(24, Math.max(1, Math.floor(Number(q.get("limit"))) || 12));
    const { products } = await getProducts({ category: category || undefined, limit });
    return NextResponse.json({ products }, { headers });
  }

  const c = await getCategory(category);
  if (!c) return NextResponse.json({ products: [], page, pages: 0 }, { status: 404 });
  const per = Math.min(48, Math.max(1, Math.floor(Number(q.get("per"))) || 24));
  const matching = listProducts(c.products, { brand: q.get("brand"), industry: q.get("industry"), sort: sortOf(q.get("sort")) });
  const pages = Math.max(1, Math.ceil(matching.length / per));
  return NextResponse.json({ products: matching.slice((page - 1) * per, page * per), page, pages }, { headers });
}
