import { Globe, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Tag, UserPlus, Wallet } from "lucide-react";
import Link from "next/link";
import { AppLink } from "@/components/app-link";
import { MentionText } from "@/components/mention-text";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { TempBadge } from "@/components/sales-bits";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvatarStack } from "@/components/user-avatar";
import { companyBalance } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { ago } from "@/lib/format";
import { money } from "@/lib/quotation";
import { aedShort, stageLabel } from "@/lib/sales";
import { getCompany } from "@/lib/sales-data";
import { CompanyDialog, CompanyNoteForm, ContactDialog, DeleteCompanyButton, DeleteContactButton } from "../company-ui";

export async function generateMetadata({ params }: PageProps<"/crm/companies/[id]">) {
  const c = await getCompany(Number((await params).id), viewerOf(await requireApp("crm"))).catch(() => null);
  return { title: `${c?.name ?? "Company"} · Zeronix CRM` };
}

export default async function CompanyPage({ params }: PageProps<"/crm/companies/[id]">) {
  const access = await requireApp("crm");
  const { user, apps } = access;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [c, bal] = await Promise.all([getCompany(id, viewerOf(access)), companyBalance(id)]);
  if (!c) notFound();
  const canMail = apps.includes("mail");
  const meta = "inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0";
  const icon = "inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/crm/companies" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{c.name}</h1>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/crm/new?company=${c.id}`} />} title="New deal for this company">
          <Plus /> Deal
        </Button>
        <CompanyDialog
          company={{ id: c.id, name: c.name, industry: c.industry, emirate: c.emirate, website: c.website, phone: c.phone, tradeLicenseNo: c.tradeLicenseNo, trn: c.trn, address: c.address, source: c.source, notes: c.notes }}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit company" title="Edit company">
              <Pencil />
            </Button>
          }
        />
        {user.role === "admin" && <DeleteCompanyButton id={c.id} name={c.name} deals={c.deals.length} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        {(c.emirate || c.industry) && (
          <span className={meta}>
            <MapPin /> {[c.emirate, c.industry].filter(Boolean).join(" · ")}
          </span>
        )}
        {c.website && (
          <span className={meta}>
            <Globe /> {c.website}
          </span>
        )}
        {c.phone && (
          <span className={meta}>
            <Phone /> {c.phone}
          </span>
        )}
        {c.source && (
          <span className={meta}>
            <Tag /> {c.source}
          </span>
        )}
        {c.tradeLicenseNo && <span>Licence {c.tradeLicenseNo}</span>}
        {c.trn && <span>TRN {c.trn}</span>}
        {c.ownerName && <span>Owner {c.ownerName}</span>}
        {(bal.invoices > 0 || c.deals.some((d) => d.stage === "won")) &&
          (apps.includes("sales") ? (
            <AppLink href={`/sales/customers/${c.id}`} className={`${meta} font-medium text-foreground hover:underline`} title="Customer in Accounts: documents and statement">
              <Wallet /> {bal.owed ? `Owes ${money(bal.owed)}` : "Nothing owed"}
              {bal.overdue > 0 && <span className="text-red-700 dark:text-red-400">· {money(bal.overdue)} overdue</span>}
            </AppLink>
          ) : (
            <span className={`${meta} font-medium text-foreground`}>
              <Wallet /> {bal.owed ? `Owes ${money(bal.owed)}` : "Nothing owed"}
              {bal.overdue > 0 && <span className="text-red-700 dark:text-red-400">· {money(bal.overdue)} overdue</span>}
            </span>
          ))}
      </div>
      {c.notes && <p className="px-1 text-xs whitespace-pre-line text-muted-foreground">{c.notes}</p>}

      <section className="rounded-xl border bg-card p-3">
        <Tabs defaultValue="people">
          <TabsList>
            <TabsTrigger value="people">People ({c.contacts.length})</TabsTrigger>
            <TabsTrigger value="deals">Deals ({c.deals.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes and history</TabsTrigger>
          </TabsList>

          <TabsContent value="people" className="grid gap-2 pt-1">
            {c.contacts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">
                    {p.name}
                    {p.isDecisionMaker && <span className="ml-2 text-xs font-normal text-muted-foreground">decision maker</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{[p.jobTitle, p.email, p.phone].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.phone && (
                    <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className={icon} title={p.phone} aria-label={`Call ${p.name}`}>
                      <Phone />
                    </a>
                  )}
                  {(p.whatsapp || p.phone) && (
                    <a href={`https://wa.me/${(p.whatsapp || p.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className={icon} title="Open WhatsApp" aria-label={`WhatsApp ${p.name}`}>
                      <MessageCircle />
                    </a>
                  )}
                  {p.email && canMail && (
                    <Link href={`/mail/compose?to=${encodeURIComponent(p.email)}`} className={icon} title={`Write to ${p.email}`} aria-label={`Email ${p.name}`}>
                      <Mail />
                    </Link>
                  )}
                  <ContactDialog
                    companyId={c.id}
                    contact={p}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} title="Edit">
                        <Pencil />
                      </Button>
                    }
                  />
                  <DeleteContactButton id={p.id} name={p.name} />
                </div>
              </div>
            ))}
            {!c.contacts.length && <p className="px-1 text-sm text-muted-foreground">No people yet.</p>}
            <ContactDialog
              companyId={c.id}
              trigger={
                <Button variant="outline" size="sm" className="w-fit">
                  <UserPlus /> Add person
                </Button>
              }
            />
          </TabsContent>

          <TabsContent value="deals" className="grid gap-0.5 pt-1">
            {c.deals.map((d) => (
              <Link key={d.id} href={`/crm/deals/${d.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 hover:bg-muted">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {stageLabel(d.stage)} · {aedShort(d.valueAed)}
                  </span>
                </span>
                <TempBadge checks={d.checks} />
                <AvatarStack users={d.assignees} size={22} />
              </Link>
            ))}
            {!c.deals.length && <p className="px-2 py-2 text-sm text-muted-foreground">No deals yet.</p>}
          </TabsContent>

          <TabsContent value="notes" className="grid gap-3 pt-1">
            <CompanyNoteForm companyId={c.id} />
            <ol className="grid max-h-[calc(100svh-24rem)] min-h-32 gap-2.5 overflow-y-auto border-t pt-3">
              {c.activities.map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground capitalize">{a.type}</span>
                    {a.userName && ` · ${a.userName}`} · {ago(a.at)}
                    {a.dealId && a.dealTitle && (
                      <>
                        {" · "}
                        <Link href={`/crm/deals/${a.dealId}`} className="hover:underline">
                          {a.dealTitle}
                        </Link>
                      </>
                    )}
                  </div>
                  <div className="whitespace-pre-line">
                    <MentionText body={a.body} me={user.id} />
                  </div>
                </li>
              ))}
              {!c.activities.length && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
            </ol>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
