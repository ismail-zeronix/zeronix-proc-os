import { Bot, Mail, Pencil, Plus, Star } from "lucide-react";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlTabs } from "@/components/url-tabs";
import { requireApp } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { ago } from "@/lib/format";
import { AI_USES, aiProvider } from "@/lib/prospecting/ai";
import { listAiProviders, listMailboxes, type AiProviderRow, type MailboxRow } from "@/lib/prospecting/data";
import { DAYS, capOn, weeksToTarget } from "@/lib/prospecting/sending";
import { AiActions, AiDialog, MailboxActions, MailboxDialog } from "./settings-ui";

export const metadata = { title: "Settings · Zeronix Prospecting" };

function TestState({ at, ok, error }: { at: Date | null; ok: boolean; error: string }) {
  if (!at) return <span className="text-xs text-muted-foreground">Not tested yet</span>;
  return ok ? (
    <span className="text-xs text-emerald-700 dark:text-emerald-400">Works · tested {ago(at)}</span>
  ) : (
    <span className="text-xs text-destructive" title={error}>
      Failed {ago(at)}: {error}
    </span>
  );
}

const dayList = (days: string[]) => {
  const keys = DAYS.map((d) => d.key);
  const on = keys.filter((k) => days.includes(k));
  if (on.join() === "mon,tue,wed,thu,fri") return "Mon-Fri";
  return on.map((k) => DAYS.find((d) => d.key === k)!.label).join(", ");
};

function Mailboxes({ rows, admin }: { rows: MailboxRow[]; admin: boolean }) {
  const today = dubaiToday();
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">Emails go out from these in turn, each within its own daily limit, days and hours. Replies are read from them too.</p>
        {admin && (
          <MailboxDialog
            trigger={
              <Button variant="outline" size="sm" className="ml-auto">
                <Plus /> Add mailbox
              </Button>
            }
          />
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Mailbox</TableHead>
              <TableHead>Today&apos;s limit</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const cap = capOn({ ...m }, today);
              const weeks = weeksToTarget({ ...m }, today);
              return (
                <TableRow key={m.id}>
                  <TableCell className="py-1.5">
                    <div className="font-medium">{m.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.fromName} · {m.enabled ? <span className="text-emerald-700 dark:text-emerald-400">sending on</span> : "sending off"}
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs">
                    <div className="tabular-nums">
                      {cap} of {m.dailyCap} a day
                    </div>
                    <div className="text-muted-foreground">{!m.warmupStartedOn ? "Warm-up not started" : weeks ? `Full in about ${weeks} week${weeks > 1 ? "s" : ""}` : "Fully warmed up"}</div>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs">
                    {dayList(m.sendDays)}, {m.windowStart}-{m.windowEnd}
                  </TableCell>
                  <TableCell className="max-w-72 py-1.5">
                    <TestState at={m.lastTestAt} ok={m.lastTestOk} error={m.lastError} />
                  </TableCell>
                  <TableCell className="py-1.5">
                    {admin && (
                      <div className="flex items-center gap-1">
                        <MailboxActions id={m.id} email={m.email} enabled={m.enabled} tested={m.lastTestOk} />
                        <MailboxDialog
                          mailbox={{
                            id: m.id,
                            email: m.email,
                            fromName: m.fromName,
                            username: m.username === m.email ? "" : m.username,
                            smtpHost: m.smtpHost,
                            smtpPort: m.smtpPort,
                            imapHost: m.imapHost,
                            imapPort: m.imapPort,
                            startCap: m.startCap,
                            dailyCap: m.dailyCap,
                            rampPerWeek: m.rampPerWeek,
                            warmupStartedOn: m.warmupStartedOn ?? "",
                            sendDays: m.sendDays,
                            windowStart: m.windowStart,
                            windowEnd: m.windowEnd,
                            signature: m.signature,
                          }}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${m.email}`} title="Edit">
                              <Pencil />
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty>No sending mailboxes yet. Buy a separate domain for cold email, create 2-3 mailboxes on it, and add them here.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AiProviders({ rows, admin }: { rows: AiProviderRow[]; admin: boolean }) {
  const useLabel = (k: string) => AI_USES.find((u) => u.key === k)?.label ?? k;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Nothing uses AI yet: research and writing stay with people for now. Providers saved here are ready for when AI features are switched on. Keys are stored encrypted and never shown again.
        </p>
        {admin && (
          <AiDialog
            trigger={
              <Button variant="outline" size="sm" className="ml-auto shrink-0">
                <Plus /> Add provider
              </Button>
            }
          />
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Used for</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} className={p.enabled ? "" : "text-muted-foreground"}>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    {p.label}
                    {p.isDefault && (
                      <span className="inline-flex items-center gap-0.5 text-xs font-normal text-amber-700 dark:text-amber-400 [&_svg]:size-3">
                        <Star className="fill-current" /> default
                      </span>
                    )}
                    {!p.enabled && <span className="text-xs font-normal">(not in use)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {aiProvider(p.provider)?.label ?? p.provider}
                    {p.keyHint && ` · key …${p.keyHint}`}
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-xs">{p.model || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs">{p.uses.length ? p.uses.map(useLabel).join(", ") : "-"}</TableCell>
                <TableCell className="max-w-72 py-1.5">
                  <TestState at={p.lastTestAt} ok={p.lastTestOk} error={p.lastError} />
                </TableCell>
                <TableCell className="py-1.5">
                  {admin && (
                    <div className="flex items-center gap-1">
                      <AiActions id={p.id} label={p.label} isDefault={p.isDefault} />
                      <AiDialog
                        ai={{ id: p.id, label: p.label, provider: p.provider, model: p.model, baseUrl: p.baseUrl, uses: p.uses, enabled: p.enabled, keyHint: p.keyHint }}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.label}`} title="Edit">
                            <Pencil />
                          </Button>
                        }
                      />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty>No AI providers yet. Add Claude, OpenAI, Gemini, any OpenAI-compatible service or local Ollama.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default async function ProspectingSettingsPage({ searchParams }: PageProps<"/prospecting/settings">) {
  const { user } = await requireApp("prospecting");
  const admin = user.role === "admin";
  const [mailboxes, ai, sp] = await Promise.all([listMailboxes(), listAiProviders(), searchParams]);
  const on = mailboxes.filter((m) => m.enabled).length;
  return (
    <div className="grid gap-3">
      <PageToolbar title="Settings" meta={`${mailboxes.length} mailbox${mailboxes.length === 1 ? "" : "es"} (${on} sending) · ${ai.length} AI provider${ai.length === 1 ? "" : "s"}${admin ? "" : " · only admins can change these"}`} />
      <UrlTabs
        initial={sp.tab}
        tabs={[
          { key: "mailboxes", label: "Sending mailboxes", icon: <Mail />, content: <Mailboxes rows={mailboxes} admin={admin} /> },
          { key: "ai", label: "AI providers", icon: <Bot />, content: <AiProviders rows={ai} admin={admin} /> },
        ]}
      />
    </div>
  );
}
