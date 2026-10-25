import { NextResponse, type NextRequest } from "next/server";
import { hasApp } from "@/lib/auth/session";
import { searchOffers } from "@/lib/search";
import { getSetting } from "@/lib/settings";

/** "Find price" in a deal or a project BOQ: supplier offers for a search. Needs Procurement, because it shows what we pay. */
export async function GET(req: NextRequest) {
  if (!((await hasApp("sales")) || (await hasApp("projects"))) || !(await hasApp("procurement"))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return NextResponse.json({ products: [] });
  const staleDays = Number(await getSetting("stale_days")) || 14;
  const { products, total } = await searchOffers({ q, pricedOnly: true, latestOnly: true, limit: 12 }, staleDays);
  return NextResponse.json({
    total,
    products: products.map((p) => ({
      id: p.id,
      label: p.label,
      spec: p.specSummary,
      category: p.category,
      offers: p.offers.slice(0, 6).map((o) => ({
        id: o.id,
        supplier: o.supplierName,
        price: o.price,
        currency: o.currency,
        priceAed: o.priceAed,
        basis: o.priceBasis,
        stock: o.stockNote,
        receivedAt: o.receivedAt,
        stale: o.stale,
        best: o.id === p.bestOfferId,
      })),
    })),
  });
}
