import { Building2, FolderKanban, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { projectOfDeal } from "@/lib/projects-data";
import { dealItemsOf, quoteDefaults, quotesOfDeal } from "@/lib/quotes-data";
import { aed, isOpen, stageLabel } from "@/lib/sales";
import { getDeal, listDeals, salesUsers } from "@/lib/sales-data";
import { DealDialog } from "../../../crm/new/deal-dialog";
import { DealItems } from "./deal-items";

export const metadata = { title: "Quote · Zeronix Sales" };

/**
 * The quote builder: the deal's lines (with Find price from Procurement), then Make quote, or Update the open quote.
 * Without `?deal=` it asks which deal the quote is for. Project deals are priced from their BOQ in Projects.
 */
export default async function QuoteBuilderPage({ searchParams }: PageProps<"/sales/quotes/new">) {
  const access = await requireApp("sales");
  const { user, apps } = access;
  const v = financeViewerOf(access);
  const sp = await searchParams;
  const dealId = Number(Array.isArray(sp.deal) ? sp.deal[0] : sp.deal);
  const crm = apps.includes("crm");

  if (!dealId) {
    const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
    const deals = (await listDeals(v, { kind: "product", q: q || undefined })).filter((d) => isOpen(d.stage)).slice(0, 50);
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <BackButton fallback="/sales/quotes" />
          <h1 className="flex-1 text-sm font-semibold">New quote: which deal is it for?</h1>
          {crm && <DealDialog users={await salesUsers()} meId={user.id} stage="sourcing" label="New deal" quoteNext />}
        </div>
        <form className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Customer, deal or contact…" className="pl-8" autoFocus />
        </form>
        <div className="rounded-lg border bg-card">
          {deals.length ? (
            <ul className="divide-y">
              {deals.map((d) => (
                <li key={d.id}>
                  <Link href={`/sales/quotes/new?deal=${d.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.companyName}
                        {d.contactName ? ` · ${d.contactName}` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{stageLabel(d.stage)}</span>
                    <span className="w-24 text-right text-xs tabular-nums">{aed(d.valueAed)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{q ? "No open deal matches." : crm ? "No open deals. Press New deal to add one." : "No open deals you can quote."}</Empty>
          )}
        </div>
        <p className="px-1 text-xs text-muted-foreground">Open product deals only. Project deals are priced from their BOQ in Projects.</p>
      </div>
    );
  }

  const deal = await getDeal(dealId, v);
  if (!deal) notFound();
  const project = await projectOfDeal(dealId);
  const [items, quotes, defaults] = await Promise.all([dealItemsOf(dealId), quotesOfDeal(dealId), quoteDefaults()]);
  const meta = "inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/sales/quotes" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight" title={deal.title}>
          Quote · {deal.title}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <Link href={`/sales/customers/${deal.companyId}`} className={`${meta} hover:text-foreground hover:underline`}>
          <Building2 /> {deal.companyName}
        </Link>
        <span>{stageLabel(deal.stage)}</span>
        {crm && (
          <AppLink href={`/crm/deals/${deal.id}`} className="hover:text-foreground hover:underline">
            Open the deal
          </AppLink>
        )}
      </div>
      <section className="rounded-xl border bg-card p-3">
        {project ? (
          <div className="flex flex-wrap items-center gap-3 p-2">
            <FolderKanban className="size-5 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm">This is a project: it is priced as a BOQ in sections, and the quote is made from the BOQ in Projects.</p>
            {apps.includes("projects") && (
              <Button size="sm" variant="outline" nativeButton={false} render={<AppLink href={`/projects/list/${project.id}?tab=boq`} />}>
                Open the BOQ
              </Button>
            )}
          </div>
        ) : (
          <DealItems
            dealId={deal.id}
            items={items}
            quotes={quotes}
            defaults={{ marginPct: defaults.marginPct, vatPct: defaults.vatPct }}
            canFindPrice={apps.includes("procurement")}
            searchHint=""
          />
        )}
      </section>
    </div>
  );
}
