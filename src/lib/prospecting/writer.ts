import "server-only";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBrand } from "@/lib/brand";
import { isSearchService } from "./ai";
import { AiUnavailable, askProvider, restModels, type ProviderRow } from "./ai-client";
import { greetingFor, offerLine } from "./outreach-rules";
import { signalLabel } from "./constants";
import { checkEmail, writePrompt, type WriteInput, type WrittenEmail } from "./writer-rules";

/** A provider paused for less than this (requests per minute) is waited for instead of skipped. */
const SHORT_PAUSE_MS = 90_000;

/** Providers that may write emails: ones set up for "Email drafts" first, then the research ones; free models first. */
async function writers(): Promise<ProviderRow[]> {
  const rows = await db
    .select()
    .from(schema.prospectAiProviders)
    .where(and(eq(schema.prospectAiProviders.enabled, true), ne(schema.prospectAiProviders.provider, "ollama"), sql`${schema.prospectAiProviders.uses} && ARRAY['writing','research']::text[]`))
    .orderBy(desc(schema.prospectAiProviders.isDefault), schema.prospectAiProviders.id);
  const usable = rows.filter((p) => !isSearchService(p.provider) && (p.autoFree || p.model));
  const rank = (p: ProviderRow) => (p.uses.includes("writing") ? 0 : 2) + (p.provider === "openrouter" && p.autoFree ? 0 : 1);
  return usable.sort((a, b) => rank(a) - rank(b));
}

/** Emails a provider has written today (its daily limit covers writing as well as research). */
async function writtenToday(providerId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachEnrollments)
    .where(and(eq(schema.outreachEnrollments.aiProviderId, providerId), gte(schema.outreachEnrollments.updatedAt, sql`date_trunc('day', now() AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai'`)));
  return n;
}

export type WriteOutcome = { email: WrittenEmail; providerId: number; model: string } | { error: string; waiting: boolean };

/** True when some provider could write an email now or later today. */
export async function canWrite(): Promise<boolean> {
  return (await writers()).length > 0;
}

/**
 * Asks providers in turn until one writes a usable email. A provider out of its allowance is skipped (waiting = true
 * when that is the only reason, so the email is tried again later); a free model whose answer fails the checks rests
 * and another model is asked.
 */
export async function writeEmail(input: WriteInput): Promise<WriteOutcome> {
  const providers = await writers();
  if (!providers.length) return { error: "No AI provider is set up. Add one in Prospecting settings (OpenRouter free models work).", waiting: false };
  const prompt = writePrompt(input);
  const problems: string[] = [];
  let out = 0;
  for (let p of providers) {
    const wait = p.outUntil ? p.outUntil.getTime() - Date.now() : 0;
    if (wait > 0 && wait <= SHORT_PAUSE_MS) {
      await new Promise((r) => setTimeout(r, wait + 1000));
      p = { ...p, outUntil: null };
    }
    if ((p.outUntil && p.outUntil > new Date()) || (await writtenToday(p.id)) >= p.dailyLimit) {
      out++;
      problems.push(`${p.label}: out of today's allowance`);
      continue;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const reply = await askProvider(p, prompt, { search: false, maxTokens: 3000 });
        const checked = checkEmail(reply.text, input.greeting);
        if ("email" in checked) return { email: checked.email, providerId: p.id, model: reply.model };
        problems.push(`${reply.model}: ${checked.problem}`);
        if (!(p.provider === "openrouter" && p.autoFree)) break;
        await restModels(p.id, [reply.model], `Email not usable: ${checked.problem}`);
      } catch (e) {
        if (e instanceof AiUnavailable && e.reason === "quota") out++;
        problems.push(`${p.label}: ${(e as Error).message}`);
        break;
      }
    }
  }
  return { error: problems.slice(-3).join(" · ").slice(0, 400), waiting: out === providers.length };
}

/** What AI needs to know to write to one prospect. */
export async function writeInputFor(companyId: number, personId: number | null, brief: string): Promise<WriteInput | null> {
  const [c] = await db.select().from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
  if (!c) return null;
  const [person] = personId ? await db.select().from(schema.prospectPeople).where(eq(schema.prospectPeople.id, personId)) : [];
  const signals = await db
    .select({ kind: schema.prospectSignals.kind, detail: schema.prospectSignals.detail })
    .from(schema.prospectSignals)
    .where(eq(schema.prospectSignals.companyId, companyId))
    .orderBy(desc(schema.prospectSignals.observedOn))
    .limit(2);
  const brand = await getBrand();
  return {
    brief,
    sender: brand.company,
    company: c.name,
    industry: c.industry,
    emirate: c.emirate,
    website: c.website || c.domain || "",
    greeting: greetingFor(person?.name ?? "", c.name),
    personName: person?.name ?? "",
    personTitle: person?.title ?? "",
    personalLine: c.personalLine,
    signals: signals.map((s) => `${signalLabel(s.kind)}: ${s.detail}`),
  };
}

/** The offer as a phrase for templates: the first line of a campaign brief. */
export const offerOf = (brief: string) => offerLine(brief.split("\n")[0] ?? "");
