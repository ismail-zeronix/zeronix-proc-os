import { type NextRequest } from "next/server";
import { hasApp } from "@/lib/auth/session";
import { canSeeCompany, currentViewer } from "@/lib/auth/visibility";
import { contactsOfCompany } from "@/lib/sales-data";

/** The people at one company, for the contact picker (only for companies the person may see). */
export async function GET(req: NextRequest) {
  if (!(await hasApp("sales"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = Number(req.nextUrl.searchParams.get("companyId"));
  if (!Number.isInteger(companyId) || companyId < 1) return Response.json({ contacts: [] });
  if (!(await canSeeCompany(await currentViewer(), companyId))) return Response.json({ contacts: [] });
  return Response.json({ contacts: await contactsOfCompany(companyId) });
}
