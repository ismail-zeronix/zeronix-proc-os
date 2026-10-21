import { Globe, Mail, MapPin, MessageCircle, Pencil, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TempBadge } from "@/components/sales-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { aed, stageLabel } from "@/lib/sales";
import { getCompany } from "@/lib/sales-data";
import { CompanyDialog, CompanyNoteForm, ContactDialog, DeleteCompanyButton, DeleteContactButton } from "../company-ui";

export async function generateMetadata({ params }: PageProps<"/sales/companies/[id]">) {
  const c = await getCompany(Number((await params).id)).catch(() => null);
  return { title: `${c?.name ?? "Company"} · Zeronix Sales` };
}

export default async function CompanyPage({ params }: PageProps<"/sales/companies/[id]">) {
  const { user, apps } = await requireApp("sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const c = await getCompany(id);
  if (!c) notFound();
  const canMail = apps.includes("mail");
  const open = c.deals.filter((d) => d.stage !== "won" && d.stage !== "lost");

  return (
    <div className="grid gap-5">
      <PageHeader
        back={{ href: "/sales/companies", label: "Companies" }}
        title={c.name}
        description={[c.industry, c.emirate].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Button nativeButton={false} render={<Link href={`/sales/new?company=${c.id}`} />}>
              <Plus /> New enquiry
            </Button>
            <CompanyDialog
              company={{ id: c.id, name: c.name, industry: c.industry, emirate: c.emirate, website: c.website, phone: c.phone, tradeLicenseNo: c.tradeLicenseNo, trn: c.trn, source: c.source, notes: c.notes }}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil /> Edit
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">People</CardTitle>
              <ContactDialog
                companyId={c.id}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus /> Add person
                  </Button>
                }
              />
            </CardHeader>
            <CardContent className="grid gap-2">
              {c.contacts.map((p) => (
                <div key={p.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3">
                  <div className="grid gap-1 text-sm">
                    <div className="font-medium">
                      {p.name}
                      {p.isDecisionMaker && <span className="ml-2 text-xs font-normal text-muted-foreground">decision maker</span>}
                    </div>
                    {p.jobTitle && <div className="text-muted-foreground">{p.jobTitle}</div>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {p.phone && (
                        <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline">
                          <Phone className="size-3.5 text-muted-foreground" /> {p.phone}
                        </a>
                      )}
                      {(p.whatsapp || p.phone) && (
                        <a href={`https://wa.me/${(p.whatsapp || p.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                          <MessageCircle className="size-3.5 text-muted-foreground" /> WhatsApp
                        </a>
                      )}
                      {p.email &&
                        (canMail ? (
                          <Link href={`/mail/compose?to=${encodeURIComponent(p.email)}`} className="inline-flex items-center gap-1.5 hover:underline">
                            <Mail className="size-3.5 text-muted-foreground" /> {p.email}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="size-3.5 text-muted-foreground" /> {p.email}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    <ContactDialog
                      companyId={c.id}
                      contact={p}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`}>
                          <Pencil />
                        </Button>
                      }
                    />
                    <DeleteContactButton id={p.id} name={p.name} />
                  </div>
                </div>
              ))}
              {!c.contacts.length && <p className="text-sm text-muted-foreground">No people yet. Add the person you talk to.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deals ({c.deals.length})</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1">
              {c.deals.map((d) => (
                <Link key={d.id} href={`/sales/deals/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {stageLabel(d.stage)} · {aed(d.valueAed)}
                    </div>
                  </div>
                  <TempBadge checks={d.checks} />
                </Link>
              ))}
              {!c.deals.length && <p className="px-2 py-2 text-sm text-muted-foreground">No deals yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History and notes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <CompanyNoteForm companyId={c.id} />
              <ol className="grid gap-3 border-t pt-4">
                {c.activities.map((a) => (
                  <li key={a.id} className="text-sm">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground capitalize">{a.type}</span>
                      {a.userName && ` · ${a.userName}`} · {ago(a.at)}
                      {a.dealId && a.dealTitle && (
                        <>
                          {" · "}
                          <Link href={`/sales/deals/${a.dealId}`} className="hover:underline">
                            {a.dealTitle}
                          </Link>
                        </>
                      )}
                    </div>
                    <div className="whitespace-pre-line">{a.body}</div>
                  </li>
                ))}
                {!c.activities.length && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {c.website && (
                <span className="inline-flex items-center gap-2">
                  <Globe className="size-3.5 text-muted-foreground" /> {c.website}
                </span>
              )}
              {c.phone && (
                <span className="inline-flex items-center gap-2">
                  <Phone className="size-3.5 text-muted-foreground" /> {c.phone}
                </span>
              )}
              {(c.emirate || c.industry) && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-3.5 text-muted-foreground" /> {[c.emirate, c.industry].filter(Boolean).join(" · ")}
                </span>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                {c.tradeLicenseNo && (
                  <>
                    <dt>Licence</dt>
                    <dd className="text-foreground">{c.tradeLicenseNo}</dd>
                  </>
                )}
                {c.trn && (
                  <>
                    <dt>TRN</dt>
                    <dd className="text-foreground">{c.trn}</dd>
                  </>
                )}
                {c.source && (
                  <>
                    <dt>Found via</dt>
                    <dd className="text-foreground">{c.source}</dd>
                  </>
                )}
                {c.ownerName && (
                  <>
                    <dt>Owner</dt>
                    <dd className="text-foreground">{c.ownerName}</dd>
                  </>
                )}
              </dl>
              {c.notes && <p className="border-t pt-2 whitespace-pre-line">{c.notes}</p>}
              <p className="border-t pt-2 text-xs text-muted-foreground">{open.length} open deal(s)</p>
            </CardContent>
          </Card>
          {user.role === "admin" && (
            <div>
              <DeleteCompanyButton id={c.id} name={c.name} deals={c.deals.length} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
