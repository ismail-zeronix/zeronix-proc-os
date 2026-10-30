"use client";

import { PlugZap, Power, RefreshCw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AI_PROVIDERS, AI_USES, aiProvider } from "@/lib/prospecting/ai";
import { DAYS, HARD_MAX_PER_DAY } from "@/lib/prospecting/sending";
import { useRun } from "../prospect-ui";
import {
  checkAiProvider,
  checkMailbox,
  deleteAiProvider,
  deleteMailbox,
  refreshAiModels,
  saveAiProvider,
  saveMailbox,
  setAiModelEnabled,
  setDefaultAiProvider,
  setMailboxEnabled,
  type AiProviderInput,
  type MailboxInput,
} from "./actions";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

const num = (v: string) => (v === "" ? 0 : Number(v));

export type MailboxData = Required<Omit<MailboxInput, "password">> & { id?: number };
const blankMailbox: MailboxData = {
  email: "",
  fromName: "",
  username: "",
  smtpHost: "smtp.hostinger.com",
  smtpPort: 465,
  imapHost: "imap.hostinger.com",
  imapPort: 993,
  startCap: 15,
  dailyCap: 40,
  rampPerWeek: 5,
  warmupStartedOn: "",
  sendDays: ["mon", "tue", "wed", "thu", "fri"],
  windowStart: "09:00",
  windowEnd: "17:00",
  signature: "",
};

/** Add a sending mailbox, or edit one. The password is never shown; leave it empty to keep the saved one. */
export function MailboxDialog({ mailbox, trigger }: { mailbox?: MailboxData; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<MailboxData>(mailbox ?? blankMailbox);
  const [password, setPassword] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [pending, run] = useRun();
  const set = (k: keyof MailboxData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setNum = (k: keyof MailboxData) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: num(e.target.value) });
  const toggleDay = (d: string, on: boolean) => setF({ ...f, sendDays: on ? [...f.sendDays, d] : f.sendDays.filter((x) => x !== d) });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setF(mailbox ?? blankMailbox);
          setPassword("");
          setAdvanced(false);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mailbox ? "Edit sending mailbox" : "Add sending mailbox"}</DialogTitle>
          <DialogDescription>A mailbox on the separate sending domain (not zeronix.ae). Test it after saving; it sends nothing until the test passes and you switch it on.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, ...data } = f;
            void id;
            run(() => saveMailbox(mailbox?.id ?? null, { ...data, password }), mailbox ? "Mailbox saved" : "Mailbox added. Now press Test.", () => setOpen(false));
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="mb-email" label="Email address">
              <Input id="mb-email" type="email" autoFocus value={f.email} onChange={set("email")} placeholder="sam@zeronix-it.com" />
            </Field>
            <Field id="mb-name" label="Sender name">
              <Input id="mb-name" value={f.fromName} onChange={set("fromName")} placeholder="Sam from Zeronix" />
            </Field>
            <Field id="mb-pass" label="Password" hint={mailbox ? "Leave empty to keep the saved password." : undefined}>
              <Input id="mb-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdvanced(!advanced)}>
                {advanced ? "Hide server settings" : "Server settings (Hostinger is filled in)"}
              </Button>
            </div>
          </div>
          {advanced && (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <Field id="mb-user" label="Login (if not the email)">
                <Input id="mb-user" value={f.username} onChange={set("username")} />
              </Field>
              <Field id="mb-smtp" label="SMTP server">
                <Input id="mb-smtp" value={f.smtpHost} onChange={set("smtpHost")} />
              </Field>
              <Field id="mb-smtpp" label="SMTP port">
                <Input id="mb-smtpp" type="number" value={f.smtpPort} onChange={setNum("smtpPort")} />
              </Field>
              <div className="hidden sm:block" />
              <Field id="mb-imap" label="IMAP server (for replies)">
                <Input id="mb-imap" value={f.imapHost} onChange={set("imapHost")} />
              </Field>
              <Field id="mb-imapp" label="IMAP port">
                <Input id="mb-imapp" type="number" value={f.imapPort} onChange={setNum("imapPort")} />
              </Field>
            </div>
          )}

          <div className="grid gap-3 border-t pt-3 sm:grid-cols-4">
            <Field id="mb-start" label="Start limit / day">
              <Input id="mb-start" type="number" min={1} max={HARD_MAX_PER_DAY} value={f.startCap} onChange={setNum("startCap")} />
            </Field>
            <Field id="mb-ramp" label="Add each week">
              <Input id="mb-ramp" type="number" min={0} max={50} value={f.rampPerWeek} onChange={setNum("rampPerWeek")} />
            </Field>
            <Field id="mb-cap" label="Target limit / day">
              <Input id="mb-cap" type="number" min={1} max={HARD_MAX_PER_DAY} value={f.dailyCap} onChange={setNum("dailyCap")} />
            </Field>
            <Field id="mb-warm" label="Warm-up started">
              <Input id="mb-warm" type="date" value={f.warmupStartedOn} onChange={set("warmupStartedOn")} />
            </Field>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            A new domain starts around 15 a day and grows about 5 a week to 40-50. The limit never goes above {HARD_MAX_PER_DAY}. Leave the warm-up date empty and it starts the day you switch the mailbox on.
          </p>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Sending days</span>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((d) => (
                  <label key={d.key} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={f.sendDays.includes(d.key)} onCheckedChange={(v) => toggleDay(d.key, !!v)} /> {d.label}
                  </label>
                ))}
              </div>
            </div>
            <Field id="mb-from" label="From (Dubai time)">
              <Input id="mb-from" type="time" value={f.windowStart} onChange={set("windowStart")} />
            </Field>
            <Field id="mb-to" label="Until">
              <Input id="mb-to" type="time" value={f.windowEnd} onChange={set("windowEnd")} />
            </Field>
          </div>

          <Field id="mb-sig" label="Signature" hint="Plain text under every email. Include the company address; the unsubscribe line is added by itself.">
            <Textarea id="mb-sig" rows={4} value={f.signature} onChange={set("signature")} placeholder={"Sam Ahmed\nZeronix IT Solutions\n+971 4 000 0000\nOffice 101, Business Bay, Dubai"} />
          </Field>
          <Button type="submit" pending={pending} disabled={!f.email || f.fromName.trim().length < 2 || (!mailbox && !password)}>
            {mailbox ? "Save" : "Add mailbox"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MailboxActions({ id, email, enabled, tested }: { id: number; email: string; enabled: boolean; tested: boolean }) {
  const [pending, run] = useRun();
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" pending={pending} onClick={() => run(() => checkMailbox(id), "Connection works")} title="Log in to SMTP and IMAP; sends nothing">
        <PlugZap /> Test
      </Button>
      <Button
        variant={enabled ? "secondary" : "outline"}
        size="sm"
        disabled={pending || (!enabled && !tested)}
        title={!enabled && !tested ? "Test the connection first" : enabled ? "Stop sending from this mailbox" : "Allow sending from this mailbox"}
        onClick={() => run(() => setMailboxEnabled(id, !enabled), enabled ? "Sending paused" : "Mailbox switched on")}
      >
        <Power /> {enabled ? "On" : "Off"}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${email}`} title="Delete" disabled={pending} onClick={() => confirm(`Delete ${email}? Emails waiting to go from it will need another mailbox.`) && run(() => deleteMailbox(id), "Mailbox deleted")}>
        <Trash2 />
      </Button>
    </div>
  );
}

export type AiData = Required<Omit<AiProviderInput, "apiKey">> & { id?: number; keyHint?: string };
const blankAi: AiData = { label: "", provider: "openrouter", model: "", baseUrl: "", uses: [], enabled: true, dailyLimit: 20, autoFree: true, paidSearch: false };

/** Add an AI provider, or edit one. The key is never shown; leave it empty to keep the saved one. */
export function AiDialog({ ai, trigger }: { ai?: AiData; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<AiData>(ai ?? blankAi);
  const [apiKey, setApiKey] = useState("");
  const [pending, run] = useRun();
  const def = aiProvider(f.provider) ?? AI_PROVIDERS[0];
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setF(ai ?? blankAi);
          setApiKey("");
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ai ? "Edit AI provider" : "Add AI provider"}</DialogTitle>
          <DialogDescription>{def.hint}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, keyHint, ...data } = f;
            void id;
            void keyHint;
            run(() => saveAiProvider(ai?.id ?? null, { ...data, apiKey }), ai ? "Provider saved" : "Provider added. Now press Test.", () => setOpen(false));
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ai-prov" label="Provider">
              <NativeSelect className="w-full" id="ai-prov" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value, model: "", baseUrl: "", autoFree: e.target.value === "openrouter", paidSearch: false })}>
                {AI_PROVIDERS.map((p) => (
                  <NativeSelectOption key={p.key} value={p.key}>
                    {p.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="ai-label" label="Name">
              <Input id="ai-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={`${def.label.split(" ")[0]} for drafts`} />
            </Field>
            <Field id="ai-model" label="Model">
              <Input
                id="ai-model"
                value={f.autoFree ? "" : f.model}
                disabled={f.autoFree}
                onChange={(e) => setF({ ...f, model: e.target.value })}
                list="ai-models"
                placeholder={f.autoFree ? "Free models, chosen automatically" : (def.models[0] ?? "model name")}
              />
              <datalist id="ai-models">
                {def.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field id="ai-key" label="API key" hint={ai?.keyHint ? `Saved key ends in ${ai.keyHint}. Leave empty to keep it.` : def.needsKey ? undefined : "Only if the service needs one."}>
              <Input id="ai-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </Field>
          </div>
          {f.provider === "openrouter" && (
            <div className="grid gap-2 rounded-lg border p-3">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={f.autoFree} onCheckedChange={(v) => setF({ ...f, autoFree: !!v })} />
                <span>
                  Use the free models and switch automatically
                  <span className="block text-xs text-muted-foreground">
                    The list of free models refreshes every day. Each request names the best few; if one is busy or rate limited OpenRouter moves to the next, and a model that keeps failing rests for a while.
                    When the day&apos;s free allowance is used up, the next provider takes over until 04:00 Dubai time.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={f.paidSearch} onCheckedChange={(v) => setF({ ...f, paidSearch: !!v })} />
                <span>
                  Allow paid web search for research
                  <span className="block text-xs text-muted-foreground">About $0.007 a search from your OpenRouter credits, even with free models. Off: OpenRouter only reads the pages our scraper fetched.</span>
                </span>
              </label>
            </div>
          )}
          <Field id="ai-url" label="Base URL" hint={def.baseUrl ? `Empty = ${def.baseUrl}` : "Required for this provider."}>
            <Input id="ai-url" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder={def.baseUrl || "https://..."} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Use it for</span>
            {AI_USES.map((u) => (
              <label key={u.key} className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={f.uses.includes(u.key)}
                  onCheckedChange={(v) => setF({ ...f, uses: v ? [...f.uses, u.key] : f.uses.filter((x) => x !== u.key) })}
                />
                <span>
                  {u.label} <span className="text-xs text-muted-foreground">· {u.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <Field id="ai-limit" label="Research calls a day, at most" hint="Research asks AI only when a website shows no contact; this caps it.">
            <Input id="ai-limit" type="number" min={1} max={500} className="w-32" value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: num(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: !!v })} /> In use
          </label>
          <Button type="submit" pending={pending} disabled={f.label.trim().length < 2 || (!ai && def.needsKey && !apiKey)}>
            {ai ? "Save" : "Add provider"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AiActions({ id, label, isDefault }: { id: number; label: string; isDefault: boolean }) {
  const [pending, run] = useRun();
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" pending={pending} onClick={() => run(() => checkAiProvider(id), "Connection works")} title="Check the key and model (uses no tokens)">
        <PlugZap /> Test
      </Button>
      {!isDefault && (
        <Button variant="ghost" size="icon-sm" aria-label={`Make ${label} the default`} title="Make default" disabled={pending} onClick={() => run(() => setDefaultAiProvider(id), "Default changed")}>
          <Star />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${label}`} title="Delete" disabled={pending} onClick={() => confirm(`Delete ${label} and its saved key?`) && run(() => deleteAiProvider(id), "Provider deleted")}>
        <Trash2 />
      </Button>
    </div>
  );
}

export interface FreeModelItem {
  id: number;
  modelId: string;
  name: string;
  contextLength: number;
  enabled: boolean;
  resting: boolean;
  okCount: number;
  lastError: string;
  expiresOn: string | null;
}

/** The free models of an OpenRouter provider, in the order they are tried, with on/off and a refresh. */
export function FreeModelList({ providerId, models, admin }: { providerId: number; models: FreeModelItem[]; admin: boolean }) {
  const [pending, run] = useRun();
  const ready = models.filter((m) => m.enabled && !m.resting).length;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        {models.length ? `${ready} of ${models.length} free models ready` : "No free models loaded yet"}
      </summary>
      <div className="mt-1 grid gap-x-6 gap-y-0.5 lg:grid-cols-2">
        {models.map((m, i) => (
          <label key={m.id} className={`flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted ${m.enabled ? "" : "text-muted-foreground"}`}>
            <Checkbox disabled={!admin || pending} checked={m.enabled} onCheckedChange={(v) => run(() => setAiModelEnabled(m.id, !!v), v ? "Model switched on" : "Model switched off")} />
            <span className="w-4 text-right tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate" title={m.modelId}>
              {m.name}
            </span>
            <span className="tabular-nums text-muted-foreground">{Math.round(m.contextLength / 1000)}k</span>
            {m.okCount > 0 && <span className="text-emerald-700 dark:text-emerald-400">{m.okCount} ok</span>}
            {m.resting && (
              <span className="text-amber-700 dark:text-amber-400" title={m.lastError}>
                resting
              </span>
            )}
            {m.expiresOn && <span className="text-muted-foreground">until {m.expiresOn}</span>}
          </label>
        ))}
        {admin && (
          <Button variant="ghost" size="sm" className="w-fit" pending={pending} onClick={() => run(() => refreshAiModels(providerId), "Free model list refreshed")}>
            <RefreshCw /> Refresh from OpenRouter
          </Button>
        )}
      </div>
    </details>
  );
}
