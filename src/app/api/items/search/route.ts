import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { searchItems } from "@/lib/items-data";

/**
 * Items for the line pickers on quotes, orders, invoices and bills: anyone who writes those documents. Purchase prices
 * only for the accounts team.
 */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access || !["sales", "accounts", "inventory", "crm", "projects"].some((k) => access.apps.includes(k as "sales"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  return Response.json({ items: await searchItems(q, { costs: access.finance }) });
}
