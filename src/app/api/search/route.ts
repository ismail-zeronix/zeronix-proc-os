import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { searchOffers, searchParamsFrom } from "@/lib/search";
import { getSetting } from "@/lib/settings";

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staleDays = Number(await getSetting("stale_days")) || 14;
  const result = await searchOffers(searchParamsFrom(req.nextUrl.searchParams), staleDays);
  return NextResponse.json({ ...result, staleDays });
}
