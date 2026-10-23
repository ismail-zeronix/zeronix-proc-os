import { eq } from "drizzle-orm";
import { ArrowRightLeft, Building2, CalendarCheck, CirclePlus, FileText, Handshake, Mail, MapPin, MessageCircle, Phone, Plus, StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { InvoiceStateBadge, OrderStatusBadge } from "@/components/order-bits";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { StageMenu } from "@/components/stage-menu";
import { StatStrip } from "@/components/stat-strip";
import { TaskDialog, TaskItem } from "@/components/task-ui";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/user-avatar";
import { RecordChat } from "@/components/chat/record-chat";
import { UrlTabs } from "@/components/url-tabs";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dayLabel } from "@/lib/dates";
import { ago } from "@/lib/format";
import { listOrders } from "@/lib/orders-data";
import { projectStatusLabel } from "@/lib/projects";
import { boqLines, checklistOf, getProject } from "@/lib/projects-data";
import { proposalOf } from "@/lib/proposals-data";
import { quoteDefaults, quotesOfDeal } from "@/lib/quotes-data";
import { boqMoney } from "@/lib/boq";
import { aed, stageLabel } from "@/lib/sales";
import { dealActivities, dealTasks, salesUsers } from "@/lib/sales-data";
import type { TaskRow } from "@/lib/tasks";
import { ProjectDetailsForm, ProjectStatusMenu, TaskProgress } from "../../project-ui";
import { BoqEditor } from "./boq";
import { Checklist } from "./checklist";

const ICON: Record<string, typeof Phone> = { call: Phone, whatsapp: MessageCircle, email: Mail, meeting: CalendarCheck, note: StickyNote, stage: ArrowRightLeft, created: CirclePlus };
const LABEL: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", email: "Email", meeting: "Meeting", note: "Note", stage: "Status", created: "Created" };

export async function generateMetadata({ params }: PageProps<"/projects/list/[id]">) {
  const p = await getProject(Number((await params).id), viewerOf(await requireApp("projects"))).catch(() => null);
  return { title: `${p ? `${p.number} ${p.title}` : "Project"} · Zeronix Projects` };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/list/[id]">) {
  const access = await requireApp("projects");
  const { user, apps } = access;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const p = await getProject(id, viewerOf(access));
  if (!p) notFound();
  const sp = await searchParams;

  const [activities, tasks, people, contact, quotes, orders, lines, defaults, checklist, proposal] = await Promise.all([
    dealActivities(p.dealId),
    dealTasks(p.dealId),
    salesUsers(),
    p.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, p.contactId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    quotesOfDeal(p.dealId),
    listOrders(viewerOf(access), { dealId: p.dealId }),
    boqLines(p.dealId),
    quoteDefaults(),
    checklistOf(p.id),
    proposalOf(p.id),
  ]);
  // checklist tasks go to the project team; admins and "All data" users may pick anyone in Sales
  const team = access.seesAll ? people : p.assignees;
  const checklistOpen = checklist.filter((t) => t.status === "open").length;
  const canSales = apps.includes("sales");
  const canTask = canSales && apps.includes("tasks");
  const openTasks = tasks.filter((t) => t.status === "open") as TaskRow[];
  const doneTasks = tasks.filter((t) => t.status === "done") as TaskRow[];
  const won = p.stage === "won";
  const meta = "inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/projects/list" />
        <span className="font-mono text-xs text-muted-foreground">{p.number}</span>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight" title={p.title}>
          {p.title}
        </h1>
        <span className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">{p.typeLabel}</span>
        <div className="w-44">
          {won ? <ProjectStatusMenu projectId={p.id} status={p.status} canOverride={user.role === "admin"} /> : canSales ? <StageMenu dealId={p.dealId} stage={p.stage} label="Deal stage" /> : <span className="text-sm">{stageLabel(p.stage)}</span>}
        </div>
        <AvatarStack users={p.assignees} size={28} max={4} />
      </div>

      <StatStrip
        items={[
          {
            label: "Value",
            value: aed(p.valueAed),
            // until a quote is made the value is the estimate; the BOQ shows what the work adds up to
            hint: quotes[0] ? `Quote ${quotes[0].number}` : lines.length ? `BOQ ${aed(boqMoney(lines).sell)}, no quote yet` : "No quote yet",
          },
          { label: won ? "Work status" : "Deal stage", value: won ? projectStatusLabel(p.status) : stageLabel(p.stage), hint: p.managerName ? `Manager: ${p.managerName}` : "No project manager yet" },
          { label: "Tasks", value: <TaskProgress done={p.tasksDone} open={p.tasksOpen} />, hint: p.nextDue ? `Next due ${dayLabel(p.nextDue)}` : "Nothing due" },
          {
            label: "Target completion",
            value: p.targetDate ? dayLabel(p.targetDate) : "-",
            hint: p.completedOn ? `Completed ${dayLabel(p.completedOn)}` : p.startDate ? `Starts ${dayLabel(p.startDate)}` : "No start date",
          },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border bg-card p-3">
          <UrlTabs
            initial={sp.tab}
            tabs={[
              {
                key: "boq",
                label: `BOQ (${lines.length})`,
                content: (
                  <BoqEditor
                    projectId={p.id}
                    dealId={p.dealId}
                    sections={p.boqSections}
                    lines={lines}
                    quotes={quotes}
                    defaults={{ marginPct: defaults.marginPct, vatPct: defaults.vatPct }}
                    canFindPrice={apps.includes("procurement")}
                    canOpenQuotes={canSales}
                  />
                ),
              },
              {
                key: "proposal",
                label: "Proposal",
                content: (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
                    <FileText className="size-5 text-muted-foreground" />
                    <p className="min-w-0 flex-1 text-sm">
                      {proposal ? (
                        <>
                          <span className="font-medium">{proposal.title || "Proposal"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {proposal.blocks.length} blocks · saved {ago(proposal.updatedAt)}
                            {proposal.updatedBy ? ` by ${proposal.updatedBy}` : ""}. The price block always shows this project&apos;s BOQ.
                          </span>
                        </>
                      ) : (
                        <>
                          No proposal yet.
                          <span className="block text-xs text-muted-foreground">The document the customer receives: cover, scope, the BOQ price, payment schedule, timeline and terms.</span>
                        </>
                      )}
                    </p>
                    <Button size="sm" nativeButton={false} render={<Link href={`/projects/list/${p.id}/proposal`} />}>
                      {proposal ? "Open the proposal" : "Start the proposal"}
                    </Button>
                  </div>
                ),
              },
              {
                key: "overview",
                label: "Site & plan",
                content: (
                  <ProjectDetailsForm
                    project={{ id: p.id, siteAddress: p.siteAddress, siteMapUrl: p.siteMapUrl, startDate: p.startDate, targetDate: p.targetDate, notes: p.notes, managerId: p.managerId }}
                    people={people}
                  />
                ),
              },
              {
                key: "tasks",
                label: `Tasks (${checklistOpen + openTasks.length})`,
                content: (
                  <div className="grid gap-4">
                    <Checklist projectId={p.id} tasks={checklist} people={team} typeLabel={p.typeLabel} />
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">
                        Follow-ups with the customer <span className="font-normal text-muted-foreground">({openTasks.length})</span>
                      </h3>
                      {canTask && (
                        <TaskDialog
                          related={{ type: "deal", id: p.dealId }}
                          people={user.role === "admin" ? people : undefined}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label="Add a task" title="Add a task">
                              <Plus />
                            </Button>
                          }
                        />
                      )}
                    </div>
                    <div className="grid gap-0.5">
                      {openTasks.map((t) => (
                        <TaskItem key={t.id} task={t} hideRelated showAssignee={t.assignedTo !== user.id} />
                      ))}
                      {!openTasks.length && <p className="px-2 py-1 text-xs text-muted-foreground">No open tasks.</p>}
                    </div>
                    {doneTasks.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer px-2 text-xs text-muted-foreground">{doneTasks.length} done</summary>
                        <div className="grid gap-0.5 pt-1">
                          {doneTasks.map((t) => (
                            <TaskItem key={t.id} task={t} hideRelated showAssignee={t.assignedTo !== user.id} />
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  </div>
                ),
              },
              {
                key: "quotes",
                label: `Quotes & orders (${quotes.length + orders.length})`,
                content: (
                  <div className="grid gap-1">
                    {quotes.map((q) => (
                      <AppLink key={`q${q.id}`} href={`/sales/quotes/${q.id}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                        <span className="text-sm">
                          Quote <span className="font-mono font-medium">{q.number}</span> <span className="text-xs text-muted-foreground">· {ago(q.createdAt)}</span>
                        </span>
                        <span className="flex items-center gap-2 text-sm tabular-nums">
                          {aed(q.total)} <QuoteStatusBadge status={q.shownStatus} />
                        </span>
                      </AppLink>
                    ))}
                    {orders.map((o) => (
                      <AppLink key={`o${o.id}`} href={`/sales/orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                        <span className="text-sm">
                          Order <span className="font-mono font-medium">{o.number}</span>
                        </span>
                        <span className="flex items-center gap-2 text-sm tabular-nums">
                          {aed(o.total)} <OrderStatusBadge status={o.status} />
                          {o.invoice && <InvoiceStateBadge state={o.invoice.state} />}
                        </span>
                      </AppLink>
                    ))}
                    {!quotes.length && !orders.length && (
                      <p className="px-2 py-3 text-sm text-muted-foreground">
                        No quote yet. Price the BOQ, then use Make quote on the BOQ tab.
                      </p>
                    )}
                  </div>
                ),
              },
              {
                key: "chat",
                label: "Chat",
                content: <RecordChat dealId={p.dealId} me={{ id: user.id, name: user.name, isAdmin: user.role === "admin" }} />,
              },
              {
                key: "timeline",
                label: `Timeline (${activities.length})`,
                content: (
                  <ol className="grid max-h-[calc(100svh-24rem)] min-h-40 gap-2.5 overflow-y-auto pt-1">
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
                ),
              },
            ]}
          />
        </section>

        <aside className="grid gap-3">
          <section className="rounded-xl border bg-card p-3">
            <h2 className="mb-1.5 text-sm font-medium">Customer</h2>
            <div className="grid gap-1.5 text-sm">
              {canSales ? (
                <AppLink href={`/sales/companies/${p.companyId}`} className={`${meta} font-medium hover:underline`}>
                  <Building2 /> {p.companyName}
                </AppLink>
              ) : (
                <span className={`${meta} font-medium`}>
                  <Building2 /> {p.companyName}
                </span>
              )}
              {contact && (
                <div className="grid gap-1">
                  <div>
                    {contact.name}
                    {contact.jobTitle && <span className="text-xs text-muted-foreground"> · {contact.jobTitle}</span>}
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
                  </div>
                  {contact.email && <div className="truncate text-xs text-muted-foreground">{contact.email}</div>}
                </div>
              )}
              {canSales && (
                <AppLink href={`/sales/deals/${p.dealId}`} className={`${meta} text-xs text-muted-foreground hover:text-foreground hover:underline`}>
                  <Handshake /> Open the deal
                </AppLink>
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-3">
            <h2 className="mb-1.5 text-sm font-medium">Site</h2>
            {p.siteAddress ? <p className="text-sm whitespace-pre-line">{p.siteAddress}</p> : <p className="text-xs text-muted-foreground">No site address yet. Add it under Site & plan.</p>}
            {p.siteMapUrl && (
              <a href={p.siteMapUrl} target="_blank" rel="noreferrer" className={`${meta} mt-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline`}>
                <MapPin /> Open in maps
              </a>
            )}
            {p.managerName && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">Project manager: <span className="text-foreground">{p.managerName}</span></p>}
          </section>

          {p.requirement && (
            <section className="rounded-xl border bg-card p-3">
              <h2 className="mb-1.5 text-sm font-medium">What the customer asked for</h2>
              <p className="max-h-48 overflow-y-auto text-sm whitespace-pre-line text-muted-foreground">{p.requirement}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
