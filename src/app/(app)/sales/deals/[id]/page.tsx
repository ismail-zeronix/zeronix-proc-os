import { ArrowRightLeft, Building2, CalendarDays, CirclePlus, Mail, MapPin, MessageCircle, Phone, Plus, StickyNote, Globe } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { initials, TempBadge } from "@/components/sales-bits";
import { StageMenu } from "@/components/stage-menu";
import { TaskDialog, TaskItem } from "@/components/task-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { aed, daysSince, stageLabel } from "@/lib/sales";
import { activeUsers, contactsOfCompany, dealActivities, dealTasks, getDeal } from "@/lib/sales-data";
import { type TaskRow } from "@/lib/tasks";
import { ActivityForm, ChecklistCard, DeleteDealButton, DetailsCard, RequirementCard } from "./deal-panels";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const ICON: Record<string, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: CalendarDays,
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

  const [activities, tasks, contacts, users, company] = await Promise.all([
    dealActivities(id),
    dealTasks(id),
    contactsOfCompany(deal.companyId),
    activeUsers(),
    db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId)).then((r) => r[0]),
  ]);
  const contact = deal.contactId ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, deal.contactId)).then((r) => r[0]) : null;
  const openTasks = tasks.filter((t) => t.status === "open") as TaskRow[];
  const canMail = apps.includes("mail");
  const canDelete = user.role === "admin" || deal.ownerId === user.id;
  const mailTo = contact?.email ? `/mail/compose?to=${encodeURIComponent(contact.email)}&deal=${deal.id}&subject=${encodeURIComponent(deal.title)}` : "";

  return (
    <div className="grid gap-5">
      <PageHeader
        back={{ href: "/sales", label: "Pipeline" }}
        title={deal.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/sales/companies/${deal.companyId}`} className="inline-flex items-center gap-1 hover:underline">
              <Building2 className="size-3.5" /> {deal.companyName}
            </Link>
            <span>{aed(deal.valueAed)}</span>
            <span>
              {stageLabel(deal.stage)} for {daysSince(deal.stageChangedAt)} day(s)
            </span>
            {deal.ownerName && (
              <span className="inline-flex items-center gap-1">
                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">{initials(deal.ownerName)}</span>
                {deal.ownerName}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <TempBadge checks={deal.checks} />
            <div className="w-48">
              <StageMenu dealId={deal.id} stage={deal.stage} size="default" label="Stage" />
            </div>
          </>
        }
      />
      {deal.stage === "lost" && deal.lostReason && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm">
          <span className="font-medium">Lost:</span> {deal.lostReason}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-5">
          <RequirementCard dealId={deal.id} requirement={deal.requirement} />
          <ChecklistCard dealId={deal.id} checks={deal.checks} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <ActivityForm dealId={deal.id} />
              <ol className="grid gap-3 border-t pt-4">
                {activities.map((a) => {
                  const Icon = ICON[a.type] ?? StickyNote;
                  return (
                    <li key={a.id} className="flex gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-3.5" />
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
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Follow-ups</CardTitle>
              <TaskDialog
                related={{ type: "deal", id: deal.id }}
                people={user.role === "admin" ? users : undefined}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus /> Add
                  </Button>
                }
              />
            </CardHeader>
            <CardContent className="grid gap-0.5">
              {openTasks.map((t) => (
                <TaskItem key={t.id} task={t} hideRelated showAssignee={t.assignedTo !== user.id} />
              ))}
              {!openTasks.length && <p className="px-2 py-2 text-sm text-muted-foreground">No follow-up booked. Add one so this deal does not go quiet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              {contact ? (
                <>
                  <div className="font-medium">
                    {contact.name}
                    {contact.isDecisionMaker && <span className="ml-2 text-xs font-normal text-muted-foreground">decision maker</span>}
                  </div>
                  {contact.jobTitle && <div className="text-muted-foreground">{contact.jobTitle}</div>}
                  {contact.phone && (
                    <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 hover:underline">
                      <Phone className="size-3.5 text-muted-foreground" /> {contact.phone}
                    </a>
                  )}
                  {(contact.whatsapp || contact.phone) && (
                    <a
                      href={`https://wa.me/${(contact.whatsapp || contact.phone).replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 hover:underline"
                    >
                      <MessageCircle className="size-3.5 text-muted-foreground" /> Open WhatsApp
                    </a>
                  )}
                  {contact.email && (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Mail className="size-3.5 text-muted-foreground" /> {contact.email}
                      {canMail && (
                        <Link href={mailTo} className="text-primary underline">
                          Write email
                        </Link>
                      )}
                    </span>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No contact person yet. Pick one in the details below, or add one on the company page.</p>
              )}
              {company && (
                <div className="mt-2 grid gap-1 border-t pt-2 text-muted-foreground">
                  {(company.emirate || company.industry) && (
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="size-3.5" /> {[company.emirate, company.industry].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {company.website && (
                    <span className="inline-flex items-center gap-2">
                      <Globe className="size-3.5" /> {company.website}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <DetailsCard
            deal={{ id: deal.id, title: deal.title, valueAed: deal.valueAed, expectedClose: deal.expectedClose, ownerId: deal.ownerId, source: deal.source, contactId: deal.contactId }}
            users={users}
            contacts={contacts}
          />
          {canDelete && (
            <div>
              <DeleteDealButton dealId={deal.id} title={deal.title} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
