import "server-only";
import { notFound } from "next/navigation";
import type { AppKey } from "@/lib/apps";
import { requireAccess, type Access } from "@/lib/auth/session";

/** For pages open to people of either app (e.g. invoices: Sales sees them, Accounts manages them). */
export async function requireAnyApp(...keys: AppKey[]): Promise<Access> {
  const access = await requireAccess();
  if (!keys.some((k) => access.apps.includes(k))) notFound();
  return access;
}
