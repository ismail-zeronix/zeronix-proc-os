import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CalendarCheck,
  CalendarClock,
  CirclePlus,
  Clock,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  StickyNote,
  Tag,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignPopover } from "@/components/assign-popover";
import { TempBadge } from "@/components/sales-bits";
import { StageMenu } from "@/components/stage-menu";
import { TaskDialog, TaskItem } from "@/components/task-ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { dayLabel } from "@/lib/dates";
import { ago } from "@/lib/format";
import { aed, daysSince, stageLabel } from "@/lib/sales";
import { contactsOfCompany, dealActivities, dealTasks, getDeal, salesUsers } from "@/lib/sales-data";
import { dealItemsOf, quoteDefaults, quotesOfDeal } from "@/lib/quotes-data";
import { type TaskRow } from "@/lib/tasks";
import { DealItems } from "./deal-items";
import { ActivityForm, ChecklistPanel, DeleteDealButton, DetailsPanel, RequirementPanel } from "./deal-panels";

const ICON: Record<string, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: CalendarCheck,
  note: StickyNote,
  stage: ArrowRightLeft,
  created: CirclePlus,
};
const LABEL: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", email: "Email", meeting: "Meeting", note: "Note", stage: "Stage", created: "Created" };

export async function generateMetadata({ params }: PageProps<"/sales/deals/[id]">) {
  const deal = await getDeal(Number((await params).id)).catch(() => null);
  return { title: `${deal?.title ?? "Deal"} · Zeronix Sales` };
}

export default async function DealPage({ params }: PageProps<"/sales/deals/[id]">) {
  const { user, apps } = await requireApp("sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const deal = await getDeal(id);
  if (!deal) notFound();

  const [activities, tasks, contacts, users, company, contact, items, quotes, defaults] = await Promise.all([
    dealActivities(id),
    dealTasks(id),
    contactsOfCompany(deal.companyId),
    salesUsers(),
    db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId)).then((r) => r[0]),
    deal.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, deal.contactId)).then((r) => r[0]) : Promise.resolve(null),
    dealItemsOf(id),
    quotesOfDeal(id),
    quoteDefaults(),
  ]);
  const openTasks = tasks.filter((t) => t.status === "open") as TaskRow[];
  const canMail = apps.includes("mail");
  const canDelete = user.role === "admin" || deal.assignees.some((a) => a.id === user.id);
  const mailTo = contact?.email ? `/mail/compose?to=${encodeURIComponent(contact.email)}&deal=${deal.id}&subject=${encodeURIComponent(deal.title)}` : "";
  const meta = "inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href="/sales/pipeline" />} aria-label="Back to the pipeline" title="Back to the pipeline">
          <ArrowLeft />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight" title={deal.title}>
          {deal.title}
        </h1>
        <TempBadge checks={deal.checks} />
        <div className="w-44">
          <StageMenu dealId={deal.id} stage={deal.stage} label="Stage" />
        </div>
        <AssignPopover dealId={deal.id} assignees={deal.assignees} users={users} size={28} max={4} />
        {canMail && mailTo && (
          <Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href={mailTo} />} aria-label="Write an email to the contact" title="Write an email to the contact">
            <Mail />
          </Button>
        )}
        {canDelete && <DeleteDealButton dealId={deal.id} title={deal.title} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <Link href={`/sales/companies/${deal.companyId}`} className={`${meta} hover:text-foreground hover:underline`}>
          <Building2 /> {deal.companyName}
        </Link>
        <span className={meta}>
          <Wallet /> {aed(deal.valueAed)}
        </span>
        {deal.expectedClose && (
          <span className={meta} title="Expected close">
            <CalendarClock /> {dayLabel(deal.expectedClose)}
          </span>
        )}
        {deal.source && (
          <span className={meta}>
            <Tag /> {deal.source}
          </span>
        )}
        <span className={meta}>
          <Clock /> {stageLabel(deal.stage)} for {daysSince(deal.stageChangedAt)}d
        </span>
        {deal.stage === "lost" && deal.lostReason && <span className="font-medium text-destructive">Lost: {deal.lostReason}</span>}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border bg-card p-3">
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Timeline ({activities.length})</TabsTrigger>
              <TabsTrigger value="requirement">Requirement</TabsTrigger>
              <TabsTrigger value="quote">Quote ({items.length})</TabsTrigger>
              <TabsTrigger value="check">Lead check</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="grid gap-3 pt-1">
              <ActivityForm dealId={deal.id} />
              <ol className="grid max-h-[calc(100svh-26rem)] min-h-40 gap-2.5 overflow-y-auto border-t pt-3">
                {activities.map((a) => {
                  const Icon = ICON[a.type] ?? StickyNote;
                  return (
                    <li key={a.id} className="flex gap-2.5">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-3" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{LABEL[a.type] ?? a.type}</span>
                          {a.userName && ` · ${a.userName}`} · {ago(a.at)}
                        </div>
                        <div className="text-sm whitespace-pre-line">{a.body}</div>
                      </div>
                    </li>
                  );
                })}
                {!activities.length && <li className="text-sm text-muted-foreground">Nothing logged yet.</li>}
              </ol>
            </TabsContent>
            <TabsContent value="requirement" className="pt-1">
              <RequirementPanel dealId={deal.id} requirement={deal.requirement} />
            </TabsContent>
            <TabsContent value="quote" className="pt-1">
              <DealItems
                dealId={deal.id}
                items={items}
                quotes={quotes}
                defaults={{ marginPct: defaults.marginPct, vatPct: defaults.vatPct }}
                canFindPrice={apps.includes("procurement")}
                searchHint=""
              />
            </TabsContent>
            <TabsContent value="check" className="pt-1">
              <ChecklistPanel dealId={deal.id} checks={deal.checks} />
            </TabsContent>
            <TabsContent value="details" className="pt-1">
              <DetailsPanel
                deal={{ id: deal.id, title: deal.title, valueAed: deal.valueAed, expectedClose: deal.expectedClose, source: deal.source, contactId: deal.contactId }}
                contacts={contacts}
              />
            </TabsContent>
          </Tabs>
        </section>

        <aside className="grid gap-3">
          <section className="rounded-xl border bg-card p-3">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Follow-ups <span className="font-normal text-muted-foreground">({openTasks.length})</span>
              </h2>
              <TaskDialog
                related={{ type: "deal", id: deal.id }}
                people={user.role === "admin" ? users : undefined}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="Add a follow-up" title="Add a follow-up">
                    <Plus />
                  </Button>
                }
              />
            </div>
            <div className="grid gap-0.5">
              {openTasks.map((t) => (
                <TaskItem key={t.id} task={t} hideRelated showAssignee={t.assignedTo !== user.id} />
              ))}
              {!openTasks.length && <p className="px-2 py-1 text-xs text-muted-foreground">None booked. Add one so this deal does not go quiet.</p>}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-3">
            <h2 className="mb-1.5 text-sm font-medium">Contact</h2>
            {contact ? (
              <div className="grid gap-1.5 text-sm">
                <div>
                  <div className="font-medium">
                    {contact.name}
                    {contact.isDecisionMaker && <span className="ml-2 text-xs font-normal text-muted-foreground">decision maker</span>}
                  </div>
                  {contact.jobTitle && <div className="text-xs text-muted-foreground">{contact.jobTitle}</div>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contact.phone && (
                    <Button variant="outline" size="sm" nativeButton={false} render={<a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} />} title={contact.phone}>
                      <Phone /> Call
                    </Button>
                  )}
                  {(contact.whatsapp || contact.phone) && (
                    <Button variant="outline" size="sm" nativeButton={false} render={<a href={`https://wa.me/${(contact.whatsapp || contact.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" />} title="Open WhatsApp">
                      <MessageCircle /> WhatsApp
                    </Button>
                  )}
                  {contact.email && canMail && (
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={mailTo} />} title={contact.email}>
                      <Mail /> Email
                    </Button>
                  )}
                </div>
                {contact.email && <div className="truncate text-xs text-muted-foreground">{contact.email}</div>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No contact person. Pick one in Details, or add one on the company page.</p>
            )}
            {company && (company.emirate || company.industry || company.website) && (
              <div className="mt-2 grid gap-1 border-t pt-2 text-xs text-muted-foreground">
                {(company.emirate || company.industry) && (
                  <span className={meta}>
                    <MapPin /> {[company.emirate, company.industry].filter(Boolean).join(" · ")}
                  </span>
                )}
                {company.website && (
                  <span className={meta}>
                    <Globe /> {company.website}
                  </span>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
