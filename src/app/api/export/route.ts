import { type NextRequest } from "next/server";
import { hasApp } from "@/lib/auth/session";
import { offersToCsv } from "@/lib/export";
import { searchOffers, searchParamsFrom } from "@/lib/search";
import { getSetting } from "@/lib/settings";

/** Same filters as /api/search, returned as a CSV file the sales team can open in Excel. */
export async function GET(req: NextRequest) {
  if (!(await hasApp("procurement"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const staleDays = Number(await getSetting("stale_days")) || 14;
  const { products } = await searchOffers({ ...searchParamsFrom(req.nextUrl.searchParams), limit: 1000 }, staleDays);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(offersToCsv(products), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zeronix-prices-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
