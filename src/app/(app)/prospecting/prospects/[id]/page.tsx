import { ExternalLink, Globe, Link2, Mail, MapPin, Pencil, Phone, Plus, Tag, UserPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { emailStatusLabel, roleLabel, signalLabel, websiteHref } from "@/lib/prospecting/constants";
import { getProspect, listSegments, prospectingUsers } from "@/lib/prospecting/data";
import { latestResearch, RUNNING, type ResearchRun } from "@/lib/prospecting/research";
import type { CrawlResult } from "@/lib/prospecting/research-rules";
import { MIN_SCORE, readyGaps } from "@/lib/prospecting/score";
import {
  DeletePersonButton,
  DeleteProspectButton,
  DeleteSignalButton,
  OwnerControl,
  PersonDialog,
  PersonalLineForm,
  ProspectDialog,
  ProspectNoteForm,
  SignalDialog,
  StatusControl,
} from "../../prospect-ui";
import { ResearchButtons, ResearchWatcher, UseFindingButton } from "../../research-ui";

export async function generateMetadata({ params }: PageProps<"/prospecting/prospects/[id]">) {
  await requireApp("prospecting");
  const p = await getProspect(Number((await params).id)).catch(() => null);
  return { title: `${p?.name ?? "Prospect"} · Zeronix Prospecting` };
}

const q = (s: string) => encodeURIComponent(s);
const isLink = (s: string) => /^https?:\/\//i.test(s);

/** Where to look a company up by hand. Plain links that open in the browser; nothing is fetched by the portal. */
function researchLinks(name: string, domain: string, roles: string[]) {
  const role = roles[0] ?? "Manager";
  return [
    { label: "Google", href: `https://www.google.com/search?q=${q(`"${name}" UAE`)}` },
    { label: "LinkedIn company", href: `https://www.linkedin.com/search/results/companies/?keywords=${q(name)}` },
    { label: `LinkedIn: ${role}`, href: `https://www.linkedin.com/search/results/people/?keywords=${q(`${name} ${role}`)}` },
    { label: "Team page", href: `https://www.google.com/search?q=${q(domain ? `site:${domain} team OR about OR management` : `"${name}" management team`)}` },
    { label: "Hiring?", href: `https://www.google.com/search?q=${q(`"${name}" jobs UAE (site:bayt.com OR site:naukrigulf.com OR site:gulftalent.com OR site:indeed.com)`)}` },
    { label: "News", href: `https://www.google.com/search?tbm=nws&q=${q(`"${name}" UAE`)}` },
    { label: "Licence check (NER)", href: "https://ner.economy.ae" },
  ];
}

const AI_NOTE: Record<string, string> = {
  "": "website only, no AI",
  used: "AI used",
  no_provider: "AI not set up for research",
  limit: "AI daily limit reached",
  recent: "web searched in the last 30 days",
  failed: "AI could not help",
};

/** What the last Research run found, with its sources, and a Use button to put a contact on the company. */
function ResearchFindings({ run, companyId, companyEmail, companyPhone, hasWebsite }: { run: ResearchRun | null; companyId: number; companyEmail: string; companyPhone: string; hasWebsite: boolean }) {
  const box = "grid gap-2 rounded-lg border px-3 py-2";
  if (!run)
    return (
      <div className={`${box} text-sm text-muted-foreground`}>
        {hasWebsite
          ? "Not researched yet. Research reads their website for emails, phones, people, address and hiring (free). Research with AI also lets AI pick out the people, draft a personal line and search the web for the owner or manager."
          : "No website yet. Research with AI searches the web for the website and the people who run the company, then reads the website."}
      </div>
    );
  if (RUNNING.includes(run.status))
    return (
      <div className={`${box} text-sm`}>
        <ResearchWatcher companyId={companyId} stage={run.stage} />
        <span className="text-xs text-muted-foreground">
          {run.mode === "ai" ? "Research with AI" : "Research"} runs in the background, one prospect after another. The page updates by itself when it is done.
        </span>
      </div>
    );
  const r = (run.result ?? {}) as CrawlResult;
  const ai = (run.aiResult ?? {}) as { emails?: { email: string; source: string }[]; phones?: { phone: string; source: string }[]; people?: { name: string; title: string; source: string }[]; model?: string };
  const emails = [...(r.emails ?? []).map((e) => ({ ...e, ai: false })), ...(ai.emails ?? []).map((e) => ({ ...e, ai: true }))];
  const phones = [...(r.phones ?? []).map((e) => ({ ...e, ai: false })), ...(ai.phones ?? []).map((e) => ({ ...e, ai: true }))];
  const src = (url: string, isAi: boolean) => (
    <a href={url} target="_blank" rel="noreferrer" className="truncate text-xs text-muted-foreground hover:underline" title={url}>
      {isAi ? "AI · " : ""}
      {url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
    </a>
  );
  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">Research</span>
        <span className="text-xs text-muted-foreground">
          {run.finishedAt ? ago(run.finishedAt) : ""} · {run.status === "cancelled" ? "stopped" : run.aiStatus === "used" ? `${AI_NOTE.used}: ${[run.aiProvider, ai.model].filter(Boolean).join(" · ") || "provider"}, ${run.aiTokens.toLocaleString("en-US")} tokens` : AI_NOTE[run.aiStatus] ?? run.aiStatus}
        </span>
      </div>
      <p className="text-sm">{run.summary || "Nothing found."}</p>
      {emails.length > 0 && (
        <ul className="grid gap-0.5">
          {emails.map((e) => (
            <li key={e.email} className="flex min-w-0 items-center gap-2 text-sm">
              <Mail className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0">{e.email}</span>
              {src(e.source, e.ai)}
              {e.email !== companyEmail ? <UseFindingButton companyId={companyId} kind="email" value={e.email} /> : <span className="text-xs text-emerald-700 dark:text-emerald-400">company email</span>}
            </li>
          ))}
        </ul>
      )}
      {phones.length > 0 && (
        <ul className="grid gap-0.5">
          {phones.map((ph) => (
            <li key={ph.phone} className="flex min-w-0 items-center gap-2 text-sm">
              <Phone className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 tabular-nums">{ph.phone}</span>
              {src(ph.source, ph.ai)}
              {ph.phone !== companyPhone ? <UseFindingButton companyId={companyId} kind="phone" value={ph.phone} /> : <span className="text-xs text-emerald-700 dark:text-emerald-400">company phone</span>}
            </li>
          ))}
        </ul>
      )}
      {(ai.people?.length ?? 0) > 0 && (
        <ul className="grid gap-0.5">
          {ai.people!.map((x) => (
            <li key={x.name + x.source} className="flex min-w-0 items-center gap-2 text-sm">
              <UserPlus className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0">
                {x.name}
                {x.title && <span className="text-muted-foreground"> · {x.title}</span>}
              </span>
              {src(x.source, true)}
            </li>
          ))}
        </ul>
      )}
      {(r.pages?.length ?? 0) > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{r.pages!.length} pages read</summary>
          <ul className="mt-1 grid gap-0.5">
            {r.pages!.map((pg) => (
              <li key={pg.url} className="truncate">
                <a href={pg.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {pg.url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
                {pg.title && ` · ${pg.title}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default async function ProspectPage({ params }: PageProps<"/prospecting/prospects/[id]">) {
  const { user, apps } = await requireApp("prospecting");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [p, segments, users, run] = await Promise.all([getProspect(id), listSegments(), prospectingUsers(), latestResearch(id)]);
  if (!p) notFound();
  const running = !!run && RUNNING.includes(run.status);
  const segOptions = segments.filter((s) => s.active || s.key === p.segmentKey).map((s) => ({ key: s.key, label: s.label }));
  const meta = "inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0";
  const primary = p.people.find((x) => x.isPrimary) ?? p.people[0];
  const gaps = readyGaps(p);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/prospecting/prospects" />
        <h1 className="min-w-0 flex-1 basis-[calc(100%-3rem)] truncate text-lg font-semibold tracking-tight sm:basis-0">{p.name}</h1>
        <ResearchButtons ids={[p.id]} running={running} />
        <StatusControl ids={[p.id]} status={p.status} />
        <OwnerControl ids={[p.id]} ownerId={p.ownerId} users={users} />
        <ProspectDialog
          segments={segOptions}
          prospect={{
            id: p.id,
            name: p.name,
            website: p.website,
            emirate: p.emirate,
            freeZone: p.freeZone,
            licenseNo: p.licenseNo,
            licenseDate: p.licenseDate ?? "",
            activity: p.activity,
            industry: p.industry,
            segmentKey: p.segmentKey ?? "",
            sizeBand: p.sizeBand,
            phone: p.phone,
            email: p.email,
            address: p.address,
            linkedinUrl: p.linkedinUrl,
            sourceUrl: p.sourceUrl,
            notes: p.notes,
          }}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit prospect" title="Edit prospect">
              <Pencil />
            </Button>
          }
        />
        {user.role === "admin" && <DeleteProspectButton id={p.id} name={p.name} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        {p.website && (
          <a href={websiteHref(p.website)} target="_blank" rel="noreferrer" className={`${meta} hover:text-foreground hover:underline`}>
            <Globe /> {p.domain || p.website}
          </a>
        )}
        {(p.emirate || p.freeZone) && (
          <span className={meta}>
            <MapPin /> {[p.emirate, p.freeZone].filter(Boolean).join(" · ")}
          </span>
        )}
        {p.phone && (
          <span className={meta}>
            <Phone /> {p.phone}
          </span>
        )}
        {p.email && (
          <span className={meta}>
            <Mail /> {p.email}
          </span>
        )}
        {p.segmentLabel && (
          <span className={meta}>
            <Tag /> {p.segmentLabel}
          </span>
        )}
        {p.licenseNo && <span>Licence {p.licenseNo}</span>}
        {p.licenseDate && <span>Licensed {p.licenseDate}</span>}
        {p.sizeBand && <span>{p.sizeBand} staff</span>}
        {(p.sourceName || p.sourceUrl) &&
          (isLink(p.sourceUrl) ? (
            <a href={p.sourceUrl} target="_blank" rel="noreferrer" className={`${meta} hover:text-foreground hover:underline`}>
              <Link2 /> {p.sourceName || "Source"}
            </a>
          ) : (
            <span className={meta}>
              <Link2 /> {p.sourceName}
            </span>
          ))}
        {p.crmDealId && apps.includes("crm") && (
          <AppLink href={`/crm/deals/${p.crmDealId}`} className={`${meta} font-medium text-foreground hover:underline`}>
            <ExternalLink /> CRM lead
          </AppLink>
        )}
      </div>
      {p.activity && <p className="px-1 text-xs text-muted-foreground">{p.activity}</p>}
      {p.disqualifyReason && p.status === "disqualified" && <p className="px-1 text-xs text-destructive">Disqualified: {p.disqualifyReason}</p>}
      {p.snoozeUntil && p.status === "not_now" && <p className="px-1 text-xs text-muted-foreground">Look again on {p.snoozeUntil}</p>}

      <StatStrip
        items={[
          { label: "Score", value: p.score.toFixed(1), hint: p.score < MIN_SCORE ? `Below ${MIN_SCORE}: not worth a campaign yet` : "Fit 40% · signal 40% · reach 20%" },
          { label: "Fit", value: `${p.scoreFit}/10`, hint: p.segmentKey ? "Segment, website, emirate, size" : "Pick a segment to raise it" },
          { label: "Signal", value: `${p.scoreSignal}/10`, hint: p.signals[0] ? signalLabel(p.signals[0].kind) : "Nothing happening found yet" },
          { label: "Reach", value: `${p.scoreReach}/10`, hint: primary ? `${primary.name}${primary.email ? ` · ${emailStatusLabel(primary.emailStatus).toLowerCase()} email` : " · no email"}` : "No person yet" },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 rounded-xl border bg-card p-3">
          <Tabs defaultValue="research">
            <TabsList>
              <TabsTrigger value="research">Research</TabsTrigger>
              <TabsTrigger value="people">People ({p.people.length})</TabsTrigger>
              <TabsTrigger value="signals">Signals ({p.signals.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="research" className="grid gap-4 pt-2">
              <div className={`rounded-lg border px-3 py-2 text-sm ${gaps.length ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"}`}>
                {gaps.length ? <>To be ready: {gaps.join(", ")}. Research moves it to Ready by itself once these are in place.</> : p.status === "ready" ? <>Ready for the first email.</> : <>Ready for the first email. Set the status to Ready.</>}
              </div>
              <ResearchFindings run={run} companyId={p.id} companyEmail={p.email} companyPhone={p.phone} hasWebsite={!!p.domain} />
              {p.segmentOffer && (
                <div className="text-sm">
                  <span className="text-xs text-muted-foreground">What we offer this segment: </span>
                  {p.segmentOffer}
                </div>
              )}
              <PersonalLineForm key={p.personalLine} companyId={p.id} value={p.personalLine} />
              <div className="grid gap-1.5">
                <div className="text-xs text-muted-foreground">Look them up (opens in a new tab)</div>
                <div className="flex flex-wrap gap-1.5">
                  {researchLinks(p.name, p.domain ?? "", p.segmentRoles).map((l) => (
                    <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted [&_svg]:size-3">
                      {l.label} <ExternalLink />
                    </a>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="people" className="grid gap-2 pt-2">
              {p.people.map((x) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium">
                      {x.name}
                      {x.isPrimary && <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-400">main contact</span>}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{roleLabel(x.roleKind)}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[x.title, x.email && `${x.email} (${emailStatusLabel(x.emailStatus).toLowerCase()})`, x.phone].filter(Boolean).join(" · ") || "No contact details yet"}
                    </div>
                    {(x.linkedinUrl || x.emailSource) && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        {isLink(x.linkedinUrl) && (
                          <a href={x.linkedinUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">
                            LinkedIn
                          </a>
                        )}
                        {x.emailSource &&
                          (isLink(x.emailSource) ? (
                            <a href={x.emailSource} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">
                              Where the email was seen
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Email from {x.emailSource}</span>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <PersonDialog
                      companyId={p.id}
                      roles={p.segmentRoles}
                      person={{
                        id: x.id,
                        name: x.name,
                        title: x.title,
                        roleKind: x.roleKind as "decision",
                        email: x.email,
                        emailStatus: x.emailStatus as "guess",
                        emailSource: x.emailSource,
                        phone: x.phone,
                        linkedinUrl: x.linkedinUrl,
                        isPrimary: x.isPrimary,
                      }}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${x.name}`} title="Edit">
                          <Pencil />
                        </Button>
                      }
                    />
                    <DeletePersonButton id={x.id} name={x.name} />
                  </div>
                </div>
              ))}
              {!p.people.length && <p className="px-1 text-sm text-muted-foreground">Nobody yet. Find the person who decides: {p.segmentRoles.join(", ") || "owner, MD or operations"}.</p>}
              <PersonDialog
                companyId={p.id}
                roles={p.segmentRoles}
                trigger={
                  <Button variant="outline" size="sm" className="w-fit">
                    <UserPlus /> Add person
                  </Button>
                }
              />
            </TabsContent>

            <TabsContent value="signals" className="grid gap-2 pt-2">
              {p.signals.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <div>
                      <span className="font-medium">{signalLabel(s.kind)}</span> <span className="text-xs text-muted-foreground">· {s.observedOn}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.detail}
                      {isLink(s.sourceUrl) ? (
                        <>
                          {" · "}
                          <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                            source
                          </a>
                        </>
                      ) : (
                        s.sourceUrl && ` · ${s.sourceUrl}`
                      )}
                    </div>
                  </div>
                  <DeleteSignalButton id={s.id} />
                </div>
              ))}
              {!p.signals.length && <p className="px-1 text-sm text-muted-foreground">No signals yet. Check hiring, news and the licence date: a dated reason to write makes the email a conversation.</p>}
              <SignalDialog
                companyId={p.id}
                trigger={
                  <Button variant="outline" size="sm" className="w-fit">
                    <Plus /> Add signal
                  </Button>
                }
              />
            </TabsContent>
          </Tabs>
        </section>

        <section className="grid content-start gap-3 rounded-xl border bg-card p-3">
          <h2 className="text-sm font-medium">Notes and history</h2>
          <ProspectNoteForm companyId={p.id} />
          {p.notes && <p className="text-xs whitespace-pre-line text-muted-foreground">{p.notes}</p>}
          <ul className="grid gap-2">
            {p.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <div className="text-xs text-muted-foreground">
                  {a.userName || "System"} · {ago(a.createdAt)}
                </div>
                <div className="whitespace-pre-line">{a.body}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
