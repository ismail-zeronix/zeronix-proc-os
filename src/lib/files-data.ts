import "server-only";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { fileVisible, type Viewer } from "@/lib/auth/visibility";

export interface FileRow {
  id: number;
  name: string;
  mime: string;
  size: number;
  folder: string;
  notes: string;
  relatedType: string | null;
  relatedId: number | null;
  /** Where the file is linked, e.g. "ZSO-2026-0003" or the company name, and the page that shows it. */
  related: { label: string; href: string } | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: Date;
}

/** Files the viewer may see, newest first, filtered by folder, search text, or what they are linked to. */
export async function listFiles(
  v: Viewer,
  opts: { folder?: string; q?: string; relatedType?: string; relatedId?: number; limit?: number; /** Accounts at the finance level: invoices open on their page, otherwise as the printable copy. */ finance?: boolean } = {},
): Promise<FileRow[]> {
  const where: SQL[] = [fileVisible(v, schema.files.relatedType, schema.files.relatedId)];
  if (opts.folder) where.push(eq(schema.files.folder, opts.folder));
  if (opts.q) where.push(or(ilike(schema.files.name, `%${opts.q}%`), ilike(schema.files.notes, `%${opts.q}%`))!);
  if (opts.relatedType && opts.relatedId) where.push(eq(schema.files.relatedType, opts.relatedType), eq(schema.files.relatedId, opts.relatedId));
  const rows = await db
    .select({
      id: schema.files.id,
      name: schema.files.name,
      mime: schema.files.mime,
      size: schema.files.size,
      folder: schema.files.folder,
      notes: schema.files.notes,
      relatedType: schema.files.relatedType,
      relatedId: schema.files.relatedId,
      uploadedBy: schema.files.uploadedBy,
      uploaderName: schema.users.name,
      createdAt: schema.files.createdAt,
    })
    .from(schema.files)
    .leftJoin(schema.users, eq(schema.users.id, schema.files.uploadedBy))
    .where(and(...where))
    .orderBy(desc(schema.files.createdAt))
    .limit(opts.limit ?? 500);

  const ids = (t: string) => [...new Set(rows.filter((r) => r.relatedType === t && r.relatedId).map((r) => r.relatedId!))];
  const [companies, deals, orders, invoices] = await Promise.all([
    ids("company").length ? db.select({ id: schema.companies.id, label: schema.companies.name }).from(schema.companies).where(inArray(schema.companies.id, ids("company"))) : [],
    ids("deal").length ? db.select({ id: schema.deals.id, label: schema.deals.title }).from(schema.deals).where(inArray(schema.deals.id, ids("deal"))) : [],
    ids("order").length ? db.select({ id: schema.salesOrders.id, label: schema.salesOrders.number }).from(schema.salesOrders).where(inArray(schema.salesOrders.id, ids("order"))) : [],
    ids("invoice").length ? db.select({ id: schema.invoices.id, label: schema.invoices.number }).from(schema.invoices).where(inArray(schema.invoices.id, ids("invoice"))) : [],
  ]);
  const look: Record<string, { list: { id: number; label: string }[]; href: (id: number) => string }> = {
    company: { list: companies, href: (id) => `/crm/companies/${id}` },
    deal: { list: deals, href: (id) => `/crm/deals/${id}` },
    order: { list: orders, href: (id) => `/accounts/orders/${id}` },
    invoice: { list: invoices, href: (id) => (opts.finance ? `/accounts/invoices/${id}` : `/print/invoice/${id}`) },
  };
  return rows.map((r) => {
    const l = r.relatedType ? look[r.relatedType] : undefined;
    const hit = l?.list.find((x) => x.id === r.relatedId);
    return { ...r, related: l && hit ? { label: hit.label, href: l.href(hit.id) } : null };
  });
}
