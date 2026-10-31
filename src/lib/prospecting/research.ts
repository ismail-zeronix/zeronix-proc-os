import "server-only";
import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { isSearchService } from "./ai";
import { AiUnavailable, askProvider, canSearch, restModels, searchesToday, webSearch, type ProviderRow } from "./ai-client";
import { domainOf } from "./constants";
import { guessIndustry } from "./industry";
import {
  aiPrompt,
  aiReadPrompt,
  aiSearchReadPrompt,
  cleanAi,
  keepFromPages,
  parseAiJson,
  peopleQuery,
  planFromAi,
  planFromCrawl,
  type AiFindings,
  type CrawlResult,
  type ResearchPlan,
} from "./research-rules";
import { rescoreIn } from "./rescore";

/** Do not search the web about the same company more often than this. */
const AI_COOLDOWN_DAYS = 30;
/** A provider paused for less than this (OpenRouter's per-minute limit) is waited for instead of skipped. */
const SHORT_PAUSE_MS = 90_000;

/** site = read the website only (free); ai = also let AI read the pages and search the web for the people. */
export type ResearchMode = "site" | "ai";
/** Run statuses that are still going. */
export const RUNNING = ["queued", "crawling", "crawled", "applying"];

/** Queues a Research run for each prospect that has no run going already. Returns how many were queued. */
export async function queueResearch(companyIds: number[], userId: number, mode: ResearchMode): Promise<number> {
  if (!companyIds.length) return 0;
  const busy = await db
    .select({ id: schema.prospectResearchRuns.companyId })
    .from(schema.prospectResearchRuns)
    .where(and(inArray(schema.prospectResearchRuns.companyId, companyIds), inArray(schema.prospectResearchRuns.status, RUNNING)));
  const skip = new Set(busy.map((b) => b.id));
  const companies = await db
    .select({ id: schema.prospectCompanies.id, domain: schema.prospectCompanies.domain })
    .from(schema.prospectCompanies)
    .where(inArray(schema.prospectCompanies.id, companyIds));
  // in the order they were picked, so the queue follows the list on screen
  const order = new Map(companyIds.map((id, i) => [id, i]));
  const rows = companies
    .filter((c) => !skip.has(c.id))
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((c) => ({ companyId: c.id, domain: c.domain ?? "", requestedBy: userId, mode }));
  if (rows.length) await db.insert(schema.prospectResearchRuns).values(rows);
  return rows.length;
}

/** Stops every run that has not started yet. Runs being read finish. Returns how many were stopped. */
export async function stopQueuedResearch(): Promise<number> {
  const rows = await db
    .update(schema.prospectResearchRuns)
    .set({ status: "cancelled", stage: "", summary: "Stopped before it started", finishedAt: new Date() })
    .where(eq(schema.prospectResearchRuns.status, "queued"))
    .returning({ id: schema.prospectResearchRuns.id });
  return rows.length;
}

const setStage = (runId: number, stage: string) => db.update(schema.prospectResearchRuns).set({ stage: stage.slice(0, 200) }).where(eq(schema.prospectResearchRuns.id, runId));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function companyNow(companyId: number) {
  const [c] = await db.select().from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
  if (!c) return null;
  const [people, signals] = await Promise.all([
    db.select({ name: schema.prospectPeople.name, email: schema.prospectPeople.email, roleKind: schema.prospectPeople.roleKind }).from(schema.prospectPeople).where(eq(schema.prospectPeople.companyId, companyId)),
    db.select({ kind: schema.prospectSignals.kind, observedOn: schema.prospectSignals.observedOn }).from(schema.prospectSignals).where(eq(schema.prospectSignals.companyId, companyId)),
  ]);
  return { ...c, people, signals };
}
type Company = NonNullable<Awaited<ReturnType<typeof companyNow>>>;

/**
 * Writes a plan to the prospect: empty fields, new people, signals, a history line and the new score (which moves
 * the prospect to Ready when nothing is missing any more). Returns true when it moved to Ready.
 */
async function applyPlan(companyId: number, plan: ResearchPlan, by: number | null, source: string): Promise<boolean> {
  const today = dubaiToday();
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ status: schema.prospectCompanies.status }).from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
    if (!c) return false;
    await tx
      .update(schema.prospectCompanies)
      .set({ ...plan.company, ...(c.status === "sourced" ? { status: "researching", statusChangedAt: new Date() } : {}), updatedAt: new Date() })
      .where(eq(schema.prospectCompanies.id, companyId));
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.prospectPeople)
      .where(and(eq(schema.prospectPeople.companyId, companyId), eq(schema.prospectPeople.isPrimary, true)));
    const first = plan.people.findIndex((x) => x.roleKind === "decision");
    for (const [i, p] of plan.people.entries()) {
      // the first decision maker found becomes the main contact when there is none yet
      await tx.insert(schema.prospectPeople).values({ companyId, ...p, isPrimary: n === 0 && i === first });
    }
    for (const s of plan.signals) await tx.insert(schema.prospectSignals).values({ companyId, ...s, observedOn: today, createdBy: by });
    await tx.insert(schema.prospectActivities).values({ companyId, userId: by, kind: "research", body: `${source}: ${plan.summary}` });
    if (plan.company.personalLine) {
      await tx.insert(schema.prospectActivities).values({ companyId, userId: by, kind: "research", body: `Personal line drafted by AI from their website (check it before sending): ${plan.company.personalLine}` });
    }
    return rescoreIn(tx, companyId, today);
  });
}

type AiOutcome = {
  status: "used" | "no_provider" | "limit" | "recent" | "failed";
  providerId?: number;
  tokens?: number;
  found?: Required<AiFindings> & { model: string };
  plan?: ResearchPlan;
  error?: string;
};

/** AI providers for research, cheapest first: OpenRouter free models, then the default, then the rest. */
async function providersFor(search: boolean): Promise<ProviderRow[]> {
  const rows = await researchProviders();
  const usable = rows.filter((p) => !isSearchService(p.provider) && (search ? canSearch(p) : true) && (p.autoFree || p.model));
  const free = (p: ProviderRow) => p.provider === "openrouter" && p.autoFree && !(search && p.paidSearch);
  return [...usable.filter(free), ...usable.filter((p) => !free(p))];
}

function researchProviders() {
  return db
    .select()
    .from(schema.prospectAiProviders)
    .where(and(eq(schema.prospectAiProviders.enabled, true), sql`'research' = ANY(${schema.prospectAiProviders.uses})`, ne(schema.prospectAiProviders.provider, "ollama")))
    .orderBy(desc(schema.prospectAiProviders.isDefault), schema.prospectAiProviders.id);
}

async function usedToday(providerId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.prospectResearchRuns)
    .where(and(eq(schema.prospectResearchRuns.aiProviderId, providerId), eq(schema.prospectResearchRuns.aiStatus, "used"), sql`(${schema.prospectResearchRuns.finishedAt} AT TIME ZONE 'Asia/Dubai')::date = ${dubaiToday()}::date`));
  return n;
}

/**
 * One AI step, trying providers in order. A provider that is out of today's allowance or over its research limit is
 * skipped and the next one is asked: that is the automatic switch. Inside OpenRouter, failing free models rest and
 * the next ones are tried (ai-client.ts); a model that answers with something unreadable rests too, and another model
 * is asked once more.
 */
async function runStep(
  runId: number,
  opts: { search: boolean; prompt: string; accept: (found: Required<AiFindings>) => Required<AiFindings>; toPlan: (found: Required<AiFindings>) => ResearchPlan },
): Promise<AiOutcome> {
  const providers = await providersFor(opts.search);
  if (!providers.length) return { status: "no_provider" };
  const problems: string[] = [];
  let limited = 0;
  for (let p of providers) {
    const wait = p.outUntil ? p.outUntil.getTime() - Date.now() : 0;
    if (wait > 0 && wait <= SHORT_PAUSE_MS) {
      // a minute's pause (requests per minute) is waited out; the queue goes one prospect at a time anyway
      await setStage(runId, `Waiting a minute: ${p.label} allows only a few free requests a minute`);
      await sleep(wait + 1000);
      p = { ...p, outUntil: null };
    }
    if ((p.outUntil && p.outUntil > new Date()) || (await usedToday(p.id)) >= p.dailyLimit) {
      limited++;
      continue;
    }
    // claim the call before making it, so two runs cannot both pass the daily limit
    await db.update(schema.prospectResearchRuns).set({ aiProviderId: p.id }).where(eq(schema.prospectResearchRuns.id, runId));
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const reply = await askProvider(p, opts.prompt, { search: opts.search });
        const parsed = parseAiJson(reply.text);
        if (!parsed) {
          problems.push(`${p.label} (${reply.model}): the reply was not readable`);
          if (p.provider === "openrouter" && p.autoFree) {
            await restModels(p.id, [reply.model], "The reply was not the JSON asked for");
            continue;
          }
          break;
        }
        const found = opts.accept(cleanAi(parsed));
        return { status: "used", providerId: p.id, tokens: reply.tokens, found: { ...found, model: reply.model }, plan: opts.toPlan(found) };
      } catch (e) {
        if (e instanceof AiUnavailable && e.reason === "quota") limited++;
        problems.push(`${p.label}: ${(e as Error).message}`);
        break;
      }
    }
  }
  if (!problems.length) return { status: "limit" };
  return { status: limited === providers.length ? "limit" : "failed", error: problems.join(" · ").slice(0, 500) };
}

/** True when a plan found at least one way to reach the company. */
const foundSomething = (p?: ResearchPlan) => !!p && (p.emails.length > 0 || p.phones.length > 0 || p.people.length > 0 || !!p.company.address);

const WHY: Record<string, string> = {
  no_provider: "no AI provider is set up for research",
  limit: "every AI provider is out of today's allowance or limit",
  recent: "the web was searched for this company in the last 30 days",
};
const whyNot = (o: AiOutcome) => (o.status === "failed" ? `AI could not help${o.error ? `: ${o.error}` : ""}` : WHY[o.status] ?? o.status);

/**
 * Web search for the people who run a company. Cheapest first: a search service (Tavily, free plan) whose results a
 * free model reads; then an AI provider that searches by itself (Gemini, Claude, OpenRouter with paid search).
 */
async function searchPeople(runId: number, c: Company): Promise<AiOutcome & { via?: string }> {
  const problems: string[] = [];
  const services = (await researchProviders()).filter((p) => isSearchService(p.provider));
  for (const s of services) {
    if (searchesToday(s) >= s.dailyLimit) {
      problems.push(`${s.label}: today's ${s.dailyLimit} searches are used`);
      continue;
    }
    try {
      await setStage(runId, `Searching the web for who runs ${c.name}`);
      const hits = await webSearch(s, peopleQuery(c));
      if (!hits.length) return { status: "used", tokens: 0, via: s.label, plan: planFromAi(cleanAi({}), c, { label: "Web search" }), found: { ...cleanAi({}), model: "" } };
      await setStage(runId, `AI reading ${hits.length} search results`);
      const pages = hits.map((h) => ({ url: h.url, text: `${h.title}\n${h.content}` }));
      const out = await runStep(runId, {
        search: false,
        prompt: aiSearchReadPrompt(c, hits),
        accept: (f) => keepFromPages(f, pages, { website: true }),
        toPlan: (f) => planFromAi(f, c, { label: "Web search" }),
      });
      return { ...out, via: s.label };
    } catch (e) {
      problems.push(`${s.label}: ${(e as Error).message}`);
    }
  }
  if ((await providersFor(true)).length) {
    await setStage(runId, "AI searching the web for who runs it");
    const out = await runStep(runId, { search: true, prompt: aiPrompt(c), accept: (f) => f, toPlan: (f) => planFromAi(f, c, { label: "AI web search" }) });
    if (out.status === "used" || !problems.length) return out;
    return { ...out, error: [...problems, out.error].filter(Boolean).join(" · ") };
  }
  if (problems.length) return { status: "failed", error: problems.join(" · ") };
  return { status: "no_provider", error: "No web search is set up. Add Tavily (free) in Prospecting settings" };
}

/** Sums up what one AI step changed, for the run's summary. */
function stepNote(out: AiOutcome, what: string): string {
  if (out.status !== "used") return `${what}: ${whyNot(out)}`;
  return foundSomething(out.plan) ? out.plan!.summary : `${what}: nothing new`;
}

/**
 * The AI part of "Research with AI": a free model reads the pages the scraper fetched (people, address, a personal
 * line), then, if no owner or manager is known yet, the web is searched for who runs the company.
 */
async function researchWithAi(run: typeof schema.prospectResearchRuns.$inferSelect, crawl: CrawlResult) {
  const notes: string[] = [];
  const steps: AiOutcome[] = [];
  let movedToReady = false;
  // what AI found over both steps, for the Research tab; step "search" marks a web search (30-day rule)
  let found: Required<AiFindings> & { step: string; model: string } = { ...cleanAi({}), step: "read", model: "" };
  const merge = (o: AiOutcome, step: "read" | "search") => {
    if (!o.found) return;
    found = {
      step: found.step === "search" || step === "search" ? "search" : "read",
      model: [found.model, o.found.model].filter(Boolean).join(", "),
      emails: [...found.emails, ...o.found.emails],
      phones: [...found.phones, ...o.found.phones],
      people: [...found.people, ...o.found.people],
      website: o.found.website || found.website,
      address: o.found.address || found.address,
      line: o.found.line || found.line,
      industry: o.found.industry || found.industry,
    };
  };

  let c = (await companyNow(run.companyId))!;
  const texts = (crawl.texts ?? []).filter((t) => t.text.trim().length > 80);
  if (texts.length) {
    await setStage(run.id, "AI reading the website");
    const read = await runStep(run.id, {
      search: false,
      prompt: aiReadPrompt(c.name, texts),
      accept: (f) => keepFromPages(f, texts),
      toPlan: (f) => {
        const plan = planFromAi(f, c, { siteEmails: crawl.emails, ownSite: true, label: "AI reading the website" });
        if (f.line && !c.personalLine) {
          plan.company.personalLine = f.line;
          plan.summary += ", a personal line";
        }
        // what the website text says beats a guess from the name
        if (f.industry && f.industry !== c.industry) plan.company.industry = f.industry;
        return plan;
      },
    });
    steps.push(read);
    merge(read, "read");
    if (read.plan) movedToReady = (await applyPlan(run.companyId, read.plan, run.requestedBy, "AI reading the website")) || movedToReady;
    notes.push(stepNote(read, "AI reading the website"));
    c = (await companyNow(run.companyId))!;
  }

  // the web is searched only when no owner or manager is known yet (or there is no website)
  if (!c.people.some((p) => p.roleKind === "decision") || !c.domain) {
    const [recent] = await db
      .select({ id: schema.prospectResearchRuns.id })
      .from(schema.prospectResearchRuns)
      .where(
        and(
          eq(schema.prospectResearchRuns.companyId, run.companyId),
          eq(schema.prospectResearchRuns.aiStatus, "used"),
          sql`${schema.prospectResearchRuns.aiResult}->>'step' = 'search'`,
          gte(schema.prospectResearchRuns.finishedAt, sql`now() - make_interval(days => ${AI_COOLDOWN_DAYS})`),
        ),
      )
      .limit(1);
    if (recent) {
      steps.push({ status: "recent" });
      notes.push(`Web search skipped: ${WHY.recent}`);
    } else {
      const web = await searchPeople(run.id, c);
      steps.push(web);
      merge(web, "search");
      notes.push(web.status === "used" ? `${stepNote(web, "Web search")}${web.via ? ` (via ${web.via})` : ""}` : `Web search: ${web.error && web.status === "no_provider" ? web.error : whyNot(web)}`);
      if (web.plan && web.status === "used") {
        movedToReady = (await applyPlan(run.companyId, web.plan, run.requestedBy, "Web search")) || movedToReady;
        // the search found the website we did not have: read it with the scraper too
        const site = String(web.found?.website ?? "");
        const domain = domainOf(site);
        if (domain && !c.domain) {
          const [taken] = await db.select({ id: schema.prospectCompanies.id }).from(schema.prospectCompanies).where(eq(schema.prospectCompanies.domain, domain));
          if (!taken) {
            await db.update(schema.prospectCompanies).set({ website: site, domain }).where(eq(schema.prospectCompanies.id, run.companyId));
            await db.insert(schema.prospectResearchRuns).values({ companyId: run.companyId, domain, requestedBy: run.requestedBy, mode: "ai" });
            notes.push(`Website found: reading ${domain} next`);
          } else notes.push(`${domain} already belongs to another prospect`);
        }
      }
    }
  }

  const used = steps.filter((s) => s.status === "used");
  const status = used.length ? "used" : (steps.find((s) => s.status !== "no_provider")?.status ?? "no_provider");
  return {
    aiStatus: status,
    aiProviderId: used.at(-1)?.providerId ?? null,
    aiTokens: used.reduce((n, s) => n + (s.tokens ?? 0), 0),
    aiResult: used.length ? found : { error: steps.map((s) => s.error).filter(Boolean).join(" · ") || null },
    notes,
    movedToReady,
  };
}

/** Finishes one run: applies the website findings and, for Research with AI, the AI steps. */
async function finishRun(run: typeof schema.prospectResearchRuns.$inferSelect) {
  const c = await companyNow(run.companyId);
  if (!c) {
    await db.update(schema.prospectResearchRuns).set({ status: "done", stage: "", finishedAt: new Date(), summary: "The prospect no longer exists" }).where(eq(schema.prospectResearchRuns.id, run.id));
    return;
  }
  const crawl = (run.result ?? {}) as CrawlResult;
  const notes: string[] = [];
  let ready = false;
  if (run.domain) {
    await setStage(run.id, "Saving what the website showed");
    const plan = planFromCrawl(crawl, c, dubaiToday());
    // a first guess from the name and the page titles; Research with AI may correct it from the text
    if (!c.industry) {
      const industry = guessIndustry(c.name, c.activity, ...(crawl.pages ?? []).slice(0, 3).map((p) => p.title));
      if (industry) plan.company.industry = industry;
    }
    ready = await applyPlan(run.companyId, plan, run.requestedBy, "Website research");
    notes.push(run.error && !run.pagesRead ? run.error : plan.summary);
  } else notes.push(run.mode === "ai" ? "No website yet" : "No website to read. Research with AI can look for it");

  const patch: Partial<typeof schema.prospectResearchRuns.$inferInsert> = { status: "done", stage: "" };
  if (run.mode === "ai") {
    const ai = await researchWithAi(run, crawl);
    Object.assign(patch, { aiStatus: ai.aiStatus, aiProviderId: ai.aiProviderId, aiTokens: ai.aiTokens, aiResult: ai.aiResult });
    notes.push(...ai.notes);
    ready = ready || ai.movedToReady;
  }
  if (ready) notes.push("Moved to Ready");
  patch.summary = notes.filter(Boolean).join(". ").slice(0, 500);
  patch.finishedAt = new Date();
  await db.update(schema.prospectResearchRuns).set(patch).where(eq(schema.prospectResearchRuns.id, run.id));
}

/** Runs left half-applied by a restart go back to be applied again (called once when the worker starts). */
export async function resumeApplying(): Promise<void> {
  await db.update(schema.prospectResearchRuns).set({ status: "crawled" }).where(and(eq(schema.prospectResearchRuns.status, "applying"), ne(schema.prospectResearchRuns.domain, "")));
  await db.update(schema.prospectResearchRuns).set({ status: "queued" }).where(and(eq(schema.prospectResearchRuns.status, "applying"), eq(schema.prospectResearchRuns.domain, "")));
}

/**
 * One pass of the research queue (called by the worker): finish runs the scraper has read, and runs without a website
 * (those go straight to the AI step), one at a time in the order they were queued.
 */
export async function processResearch(limit = 5): Promise<number> {
  let done = 0;
  for (; done < limit; done++) {
    const [run] = await db.transaction(async (tx) => {
      const picked = await tx.execute<{ id: number }>(sql`
        SELECT id FROM prospect_research_runs
        WHERE status = 'crawled' OR (status = 'queued' AND domain = '')
        ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const ids = picked.rows.map((r) => Number(r.id));
      if (!ids.length) return [];
      return tx
        .update(schema.prospectResearchRuns)
        .set({ status: "applying", startedAt: sql`coalesce(${schema.prospectResearchRuns.startedAt}, now())` })
        .where(inArray(schema.prospectResearchRuns.id, ids))
        .returning();
    });
    if (!run) break;
    try {
      await finishRun(run);
    } catch (e) {
      console.error("[research] run", run.id, e);
      await db.update(schema.prospectResearchRuns).set({ status: "done", stage: "", finishedAt: new Date(), summary: "Something went wrong while saving the findings" }).where(eq(schema.prospectResearchRuns.id, run.id));
    }
  }
  return done;
}

/** The latest run of a prospect, for its Research tab. */
export async function latestResearch(companyId: number) {
  const [run] = await db
    .select({
      id: schema.prospectResearchRuns.id,
      status: schema.prospectResearchRuns.status,
      mode: schema.prospectResearchRuns.mode,
      stage: schema.prospectResearchRuns.stage,
      domain: schema.prospectResearchRuns.domain,
      result: schema.prospectResearchRuns.result,
      error: schema.prospectResearchRuns.error,
      pagesRead: schema.prospectResearchRuns.pagesRead,
      aiStatus: schema.prospectResearchRuns.aiStatus,
      aiTokens: schema.prospectResearchRuns.aiTokens,
      aiResult: schema.prospectResearchRuns.aiResult,
      aiProvider: sql<string>`coalesce(${schema.prospectAiProviders.label}, '')`,
      summary: schema.prospectResearchRuns.summary,
      createdAt: schema.prospectResearchRuns.createdAt,
      finishedAt: schema.prospectResearchRuns.finishedAt,
    })
    .from(schema.prospectResearchRuns)
    .leftJoin(schema.prospectAiProviders, eq(schema.prospectAiProviders.id, schema.prospectResearchRuns.aiProviderId))
    .where(eq(schema.prospectResearchRuns.companyId, companyId))
    .orderBy(desc(schema.prospectResearchRuns.id))
    .limit(1);
  return run ?? null;
}
export type ResearchRun = NonNullable<Awaited<ReturnType<typeof latestResearch>>>;

/**
 * The research queue for the progress panel. The batch is every run still going plus those finished since the
 * oldest of them was queued; when nothing is going, the runs finished in the last 10 minutes.
 */
export async function researchQueue() {
  const R = schema.prospectResearchRuns;
  const [{ since }] = await db
    .select({ since: sql<number | null>`extract(epoch from min(${R.createdAt}))::float8` })
    .from(R)
    .where(inArray(R.status, RUNNING));
  const from = since ? sql`to_timestamp(${since})` : sql`now() - interval '10 minutes'`;
  const inBatch = since ? gte(R.createdAt, from) : and(gte(R.finishedAt, from), notInArray(R.status, RUNNING));

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${R.status} = 'done')::int`,
      stopped: sql<number>`count(*) filter (where ${R.status} = 'cancelled')::int`,
      waiting: sql<number>`count(*) filter (where ${R.status} = 'queued')::int`,
      ai: sql<number>`count(*) filter (where ${R.mode} = 'ai')::int`,
      /** When the batch was queued (epoch seconds), for the time left. */
      first: sql<number | null>`extract(epoch from min(${R.createdAt}))::float8`,
      // the website reader looks stuck: work waits, nothing is being read and nothing started for 3 minutes
      stalled: sql<boolean>`count(*) filter (where ${R.status} = 'queued' and ${R.domain} <> '' and ${R.createdAt} < now() - interval '3 minutes') > 0
        and count(*) filter (where ${R.status} = 'crawling') = 0
        and coalesce(max(${R.startedAt}) > now() - interval '3 minutes', false) = false`,
    })
    .from(R)
    .where(inBatch);

  const name = sql<string>`coalesce(${schema.prospectCompanies.name}, '')`;
  const [working, recent, ready] = await Promise.all([
    db
      .select({ id: R.id, companyId: R.companyId, name, domain: R.domain, mode: R.mode, status: R.status, stage: R.stage, startedAt: R.startedAt })
      .from(R)
      .leftJoin(schema.prospectCompanies, eq(schema.prospectCompanies.id, R.companyId))
      .where(inArray(R.status, ["crawling", "crawled", "applying"]))
      .orderBy(R.id)
      .limit(8),
    db
      .select({ id: R.id, companyId: R.companyId, name, mode: R.mode, status: R.status, summary: R.summary, finishedAt: R.finishedAt })
      .from(R)
      .leftJoin(schema.prospectCompanies, eq(schema.prospectCompanies.id, R.companyId))
      .where(and(inBatch, eq(R.status, "done")))
      .orderBy(desc(R.finishedAt))
      .limit(8),
    counts.total
      ? db
          .select({ n: sql<number>`count(distinct ${schema.prospectActivities.companyId})::int` })
          .from(schema.prospectActivities)
          .where(and(eq(schema.prospectActivities.kind, "status"), sql`${schema.prospectActivities.body} like 'Moved to Ready:%'`, gte(schema.prospectActivities.createdAt, sql`to_timestamp(${counts.first ?? 0})`)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  return { ...counts, movedToReady: ready[0]?.n ?? 0, working, recent };
}
export type ResearchQueue = Awaited<ReturnType<typeof researchQueue>>;
