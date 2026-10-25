import { eq } from "drizzle-orm";
import {
  ArrowRightLeft,
  Building2,
  CalendarCheck,
  CircleCheck,
  CalendarClock,
  CirclePlus,
  Clock,
  FolderKanban,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  StickyNote,
  Tag,
  User,
  UserCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { AppLink } from "@/components/app-link";
import { MentionText } from "@/components/mention-text";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { AssignPopover } from "@/components/assign-popover";
import { TempBadge } from "@/components/sales-bits";
import { StageMenu } from "@/components/stage-menu";
import { TaskDialog, TaskItem } from "@/components/task-ui";
import { InvoiceStateBadge, OrderStatusBadge } from "@/components/order-bits";
import { Button } from "@/components/ui/button";
import { RecordChat } from "@/components/chat/record-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { ago } from "@/lib/format";
import { aed, daysSince, stageLabel } from "@/lib/sales";
import { contactsOfCompany, dealActivities, dealTasks, getDeal, salesUsers } from "@/lib/sales-data";
import { listOrders } from "@/lib/orders-data";
import { projectOfDeal, projectTypes } from "@/lib/projects-data";
import { quoteLines, quotesOfDeal } from "@/lib/quotes-data";
import { type TaskRow } from "@/lib/tasks";
import { DealQuotes } from "./deal-quotes";
import { ActivityForm, ChecklistPanel, DeleteDealButton, DetailsPanel, KindPanel, RequirementPanel } from "./deal-panels";

const ICON: Record<string, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: CalendarCheck,
  note: StickyNote,
  stage: ArrowRightLeft,
  created: CirclePlus,
  owner: UserCheck,
  task: CircleCheck,
};
const LABEL: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", email: "Email", meeting: "Meeting", note: "Note", stage: "Stage", created: "Created", owner: "Owner", task: "Follow-up" };

export async function generateMetadata({ params }: PageProps<"/crm/deals/[id]">) {
  const deal = await getDeal(Number((await params).id), viewerOf(await requireApp("crm"))).catch(() => null);
  return { title: `${deal?.title ?? "Deal"} · Zeronix CRM` };
}

const TABS = ["timeline", "chat", "requirement", "quote", "check", "details"];

export default async function DealPage({ params, searchParams }: PageProps<"/crm/deals/[id]">) {
  const access = await requireApp("crm");
  const { user, apps, seesAll } = access;
  const tab = (await searchParams).tab;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const deal = await getDeal(id, viewerOf(access));
  if (!deal) notFound();

  const [activities, tasks, contacts, users, company, contact, quotes, orders, project, types] = await Promise.all([
    dealActivities(id),
    dealTasks(id),
    contactsOfCompany(deal.companyId),
    salesUsers(),
    db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId)).then((r) => r[0]),
    deal.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, deal.contactId)).then((r) => r[0]) : Promise.resolve(null),
    quotesOfDeal(id),
    listOrders(viewerOf(access), { dealId: id }),
    projectOfDeal(id),
    projectTypes(),
  ]);
  const lines = quotes[0] ? await quoteLines(quotes[0].id) : [];
  const today = dubaiToday();
  const openTasks = tasks.filter((t) => t.status === "open") as TaskRow[];
  const canMail = apps.includes("mail");
  // quote and order numbers named in an activity become links to their records in Sales
  const docs = new Map<string, string>([...quotes.map((q) => [q.number, `/sales/quotes/${q.id}`] as const), ...orders.map((o) => [o.number, `/sales/orders/${o.id}`] as const)]);
  const docsIn = (body: string) =>
    apps.includes("sales") ? [...new Set(body.match(/Z(?:Q|SO)-d{4}-d{3,}/g) ?? [])].flatMap((n) => (docs.has(n) ? [{ number: n, href: docs.get(n)! }] : [])) : [];
  // tasks come soonest first
  const nextTask = openTasks[0] ?? null;
  const canDelete = user.role === "admin" || deal.assignees.some((a) => a.id === user.id);
  const mailTo = contact?.email ? `/mail/compose?to=${encodeURIComponent(contact.email)}&deal=${deal.id}&subject=${encodeURIComponent(deal.title)}` : "";
  const meta = "inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/crm/deals" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight" title={deal.title}>
          {deal.title}
        </h1>
        <TempBadge checks={deal.checks} />
        <div className="w-44">
          <StageMenu dealId={deal.id} stage={deal.stage} label="Stage" />
        </div>
        <AssignPopover dealId={deal.id} assignees={deal.assignees} users={users} size={28} max={4} readOnly={!seesAll} />
        {canMail && mailTo && (
          <Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href={mailTo} />} aria-label="Write an email to the contact" title="Write an email to the contact">
            <Mail />
          </Button>
        )}
        {canDelete && <DeleteDealButton dealId={deal.id} title={deal.title} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <Link href={`/crm/companies/${deal.companyId}`} className={`${meta} font-medium text-foreground hover:underline`} title="Company">
          <Building2 /> {deal.companyName}
        </Link>
        {contact ? (
          <Link href={`/crm/companies/${deal.companyId}`} className={`${meta} hover:text-foreground hover:underline`} title="Primary contact">
            <User /> {contact.name}
            {contact.jobTitle ? ` · ${contact.jobTitle}` : ""}
          </Link>
        ) : (
          <span className={`${meta} text-amber-700 dark:text-amber-400`} title="Pick the primary contact in Details">
            <User /> No primary contact
          </span>
        )}
        <span className={meta} title="Deal value">
          <Wallet /> {aed(deal.valueAed)}
        </span>
        <span className={meta} title="Owner">
          <UserCheck /> {deal.ownerName || "No owner"}
        </span>
        <span className={meta} title="Expected close">
          <CalendarClock /> {deal.expectedClose ? `Closes ${dayLabel(deal.expectedClose)}` : "No close date"}
        </span>
        <span className={`${meta} ${nextTask?.dueDate && nextTask.dueDate < today ? "text-red-700 dark:text-red-400" : ""}`} title={nextTask ? `Next follow-up: ${nextTask.title}` : "No follow-up booked"}>
          <CalendarCheck /> {nextTask ? `Next: ${nextTask.dueDate ? dayLabel(nextTask.dueDate) : "no date"}` : "No follow-up"}
        </span>
        {deal.source && (
          <span className={meta}>
            <Tag /> {deal.source}
          </span>
        )}
        <span className={meta}>
          <Clock /> {stageLabel(deal.stage)} for {daysSince(deal.stageChangedAt)}d
        </span>
        {deal.stage === "lost" && deal.lostReason && <span className="font-medium text-destructive">Lost: {deal.lostReason}</span>}
        {project &&
          (apps.includes("projects") ? (
            <AppLink href={`/projects/list/${project.id}`} className={`${meta} font-medium text-foreground hover:underline`} title="Open the project">
              <FolderKanban /> {project.number}
            </AppLink>
          ) : (
            <span className={meta} title="Project">
              <FolderKanban /> {project.number}
            </span>
          ))}
        {orders.map((o) => (
          <AppLink key={o.id} href={`/sales/orders/${o.id}`} className="inline-flex items-center gap-1.5 hover:text-foreground" title="Sales order">
            <span className="font-mono font-medium text-foreground hover:underline">{o.number}</span>
            <OrderStatusBadge status={o.status} />
            {o.invoice && <InvoiceStateBadge state={o.invoice.state} />}
          </AppLink>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border bg-card p-3">
          <Tabs defaultValue={typeof tab === "string" && TABS.includes(tab) ? tab : "timeline"}>
            <TabsList>
              <TabsTrigger value="timeline">Activity ({activities.length})</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="requirement">Requirement</TabsTrigger>
              <TabsTrigger value="quote">Quotes ({quotes.length})</TabsTrigger>
              <TabsTrigger value="check">Qualification</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="grid gap-3 pt-1">
              <ActivityForm dealId={deal.id} canAssign={seesAll} assigneeIds={deal.assignees.map((a) => a.id)} />
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
                        <div className="text-sm whitespace-pre-line">
                          <MentionText body={a.body} me={user.id} />
                        </div>
                        {docsIn(a.body).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {docsIn(a.body).map((d) => (
                              <AppLink key={d.href} href={d.href} className="rounded-sm border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
                                {d.number}
                              </AppLink>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
                {!activities.length && <li className="text-sm text-muted-foreground">Nothing logged yet.</li>}
              </ol>
            </TabsContent>
            <TabsContent value="chat" className="pt-1">
              <RecordChat dealId={id} me={{ id: user.id, name: user.name, isAdmin: user.role === "admin" }} />
            </TabsContent>
            <TabsContent value="requirement" className="pt-1">
              <RequirementPanel dealId={deal.id} requirement={deal.requirement} />
            </TabsContent>
            <TabsContent value="quote" className="pt-1">
              <DealQuotes dealId={deal.id} quotes={quotes} lines={lines} project={project} canAccounts={apps.includes("sales")} canProjects={apps.includes("projects")} />
            </TabsContent>
            <TabsContent value="check" className="pt-1">
              <ChecklistPanel dealId={deal.id} checks={deal.checks} />
            </TabsContent>
            <TabsContent value="details" className="pt-1">
              <DetailsPanel
                deal={{ id: deal.id, title: deal.title, valueAed: deal.valueAed, expectedClose: deal.expectedClose, source: deal.source, contactId: deal.contactId }}
                contacts={contacts}
              />
              <KindPanel dealId={deal.id} kind={deal.kind} projectType={project?.typeKey ?? ""} projectTypes={types.map((t) => ({ key: t.key, label: t.label }))} />
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
