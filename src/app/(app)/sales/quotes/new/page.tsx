import { FolderKanban } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { Button } from "@/components/ui/button";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { canSeeCompany, financeViewerOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { addDays } from "@/lib/quotation";
import { projectOfDeal } from "@/lib/projects-data";
import { dealItemsOf, quoteDefaults, quotesOfDeal } from "@/lib/quotes-data";
import { getDeal, salesPeople } from "@/lib/sales-data";
import { getSetting } from "@/lib/settings";
import { customerChoices } from "../../quote-actions";
import { QuoteForm } from "../quote-form";

export const metadata = { title: "New quote · Zeronix Sales" };

const one = (v: string | string[] | undefined) => Number(Array.isArray(v) ? v[0] : v) || 0;

/**
 * New quote. Pick any customer or lead on the left (no deal needed for a quick quote), or arrive from a CRM deal
 * (`?deal=`) or a customer page (`?company=`) with it filled in. A deal that already has an open quote opens that one.
 */
export default async function NewQuotePage({ searchParams }: PageProps<"/sales/quotes/new">) {
  const access = await requireApp("sales");
  const { user, apps } = access;
  const v = financeViewerOf(access);
  const sp = await searchParams;
  const dealId = one(sp.deal);
  let companyId = one(sp.company);
  const [people, defaults, termsSetting] = await Promise.all([salesPeople(), quoteDefaults(), getSetting("default_terms_days")]);

  let deal: Awaited<ReturnType<typeof getDeal>> = null;
  if (dealId) {
    deal = await getDeal(dealId, v);
    if (!deal) notFound();
    const project = await projectOfDeal(dealId);
    if (project)
      return (
        <div className="mx-auto grid max-w-xl gap-3 rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 text-sm">
            <FolderKanban className="size-4" /> {deal.title} is a project: it is priced as a BOQ, and its quote is made from the BOQ in Projects.
          </p>
          {apps.includes("projects") && (
            <Button size="sm" variant="outline" className="w-fit" nativeButton={false} render={<AppLink href={`/projects/list/${project.id}?tab=boq`} />}>
              Open the BOQ
            </Button>
          )}
        </div>
      );
    // one quote in play per deal: change the open one instead of starting another
    const open = (await quotesOfDeal(dealId)).find((q) => q.status === "draft" || q.status === "sent");
    if (open) redirect(`/sales/quotes/${open.id}/edit`);
    companyId = deal.companyId;
  }
  const [company] = companyId && (await canSeeCompany(v, companyId)) ? await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId)) : [];
  const [choices, dealLines] = await Promise.all([company ? customerChoices(company.id) : Promise.resolve(null), deal ? dealItemsOf(deal.id) : Promise.resolve([])]);
  const me = people.some((p) => p.id === user.id) ? user.id : (people[0]?.id ?? user.id);

  return (
    <QuoteForm
        backHref="/sales/quotes"
        initial={{
          id: null,
          number: "",
          company: company ?? null,
          dealId: deal?.id ?? null,
          contactId: deal?.contactId ?? choices?.contacts[0]?.id ?? null,
          ownerId: deal?.ownerId && people.some((p) => p.id === deal!.ownerId) ? deal.ownerId : me,
          validUntil: addDays(dubaiToday(), defaults.validDays),
          termsDays: Math.max(0, Math.floor(Number(termsSetting)) || 0),
          vatPct: defaults.vatPct,
          terms: defaults.terms,
          notes: "",
          // lines already worked out on the deal (older quotes were built there) carry over
          lines: dealLines.map((l) => ({ description: l.description, qty: l.qty, costAed: l.costAed, unitPriceAed: l.unitPriceAed, supplierName: l.supplierName })),
        }}
        initialChoices={choices}
        people={people}
        defaultMargin={defaults.marginPct}
        canFindPrice={apps.includes("procurement")}
      />
  );
}
