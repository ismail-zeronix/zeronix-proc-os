import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { dubaiToday } from "@/lib/dates";
import { domainOf } from "./constants";
import { canSearch, searchWithAi, SEARCH_PROVIDERS } from "./ai-search";
import { aiPrompt, cleanAi, parseAiJson, planFromAi, planFromCrawl, type CompanyNow, type CrawlResult, type ResearchPlan } from "./research-rules";
import { rescoreIn } from "./rescore";

/** Do not ask AI about the same company more often than this. */
const AI_COOLDOWN_DAYS = 30;

/** Queues a Research run for each prospect that has no run waiting already. Returns how many were queued. */
export async function queueResearch(companyIds: number[], userId: number): Promise<number> {
  if (!companyIds.length) return 0;
  const busy = await db
    .select({ id: schema.prospectResearchRuns.companyId })
    .from(schema.prospectResearchRuns)
    .where(and(inArray(schema.prospectResearchRuns.companyId, companyIds), inArray(schema.prospectResearchRuns.status, ["queued", "crawling", "crawled"])));
  const skip = new Set(busy.map((b) => b.id));
  const companies = await db
    .select({ id: schema.prospectCompanies.id, domain: schema.prospectCompanies.domain })
    .from(schema.prospectCompanies)
    .where(inArray(schema.prospectCompanies.id, companyIds));
  const rows = companies.filter((c) => !skip.has(c.id)).map((c) => ({ companyId: c.id, domain: c.domain ?? "", requestedBy: userId }));
  if (rows.length) await db.insert(schema.prospectResearchRuns).values(rows);
  return rows.length;
}

async function companyNow(companyId: number): Promise<(CompanyNow & { name: string; website: string; activity: string; emirate: string; freeZone: string; status: string }) | null> {
  const [c] = await db.select().from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
  if (!c) return null;
  const [people, signals] = await Promise.all([
    db.select({ name: schema.prospectPeople.name, email: schema.prospectPeople.email }).from(schema.prospectPeople).where(eq(schema.prospectPeople.companyId, companyId)),
    db.select({ kind: schema.prospectSignals.kind, observedOn: schema.prospectSignals.observedOn }).from(schema.prospectSignals).where(eq(schema.prospectSignals.companyId, companyId)),
  ]);
  return { ...c, people, signals };
}

/** Writes a plan to the prospect: empty fields, new people, signals, a history line and the new score. */
async function applyPlan(companyId: number, plan: ResearchPlan, by: number | null, source: string) {
  const today = dubaiToday();
  await db.transaction(async (tx) => {
    const [c] = await tx.select({ status: schema.prospectCompanies.status }).from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
    if (!c) return;
    await tx
      .update(schema.prospectCompanies)
      .set({ ...plan.company, ...(c.status === "sourced" ? { status: "researching", statusChangedAt: new Date() } : {}), updatedAt: new Date() })
      .where(eq(schema.prospectCompanies.id, companyId));
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.prospectPeople).where(eq(schema.prospectPeople.companyId, companyId));
    for (const [i, p] of plan.people.entries()) {
      // the first decision maker found becomes the main contact when there is nobody yet
      const primary = n === 0 && i === plan.people.findIndex((x) => x.roleKind === "decision");
      await tx.insert(schema.prospectPeople).values({ companyId, ...p, isPrimary: primary });
    }
    for (const s of plan.signals) await tx.insert(schema.prospectSignals).values({ companyId, ...s, observedOn: today, createdBy: by });
    await tx.insert(schema.prospectActivities).values({ companyId, userId: by, kind: "research", body: `${source}: ${plan.summary}` });
    await rescoreIn(tx, companyId, today);
  });
}

type AiOutcome = { status: "used" | "no_provider" | "limit" | "recent" | "failed"; providerId?: number; tokens?: number; result?: Record<string, unknown>; plan?: ResearchPlan; error?: string };

/** The AI step, used only when the website gave nothing (or there is no website). Cheapest checks first. */
async function askAi(runId: number, companyId: number, c: NonNullable<Awaited<ReturnType<typeof companyNow>>>): Promise<AiOutcome> {
  const [recent] = await db
    .select({ id: schema.prospectResearchRuns.id })
    .from(schema.prospectResearchRuns)
    .where(
      and(
        eq(schema.prospectResearchRuns.companyId, companyId),
        eq(schema.prospectResearchRuns.aiStatus, "used"),
        gte(schema.prospectResearchRuns.finishedAt, sql`now() - make_interval(days => ${AI_COOLDOWN_DAYS})`),
      ),
    )
    .limit(1);
  if (recent) return { status: "recent" };

  const providers = await db
    .select()
    .from(schema.prospectAiProviders)
    .where(and(eq(schema.prospectAiProviders.enabled, true), inArray(schema.prospectAiProviders.provider, [...SEARCH_PROVIDERS]), sql`'research' = ANY(${schema.prospectAiProviders.uses})`))
    .orderBy(desc(schema.prospectAiProviders.isDefault), schema.prospectAiProviders.id);
  if (!providers.length) return { status: "no_provider" };

  for (const p of providers) {
    if (!canSearch(p.provider) || !p.model) continue;
    const [{ used }] = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(schema.prospectResearchRuns)
      .where(and(eq(schema.prospectResearchRuns.aiProviderId, p.id), eq(schema.prospectResearchRuns.aiStatus, "used"), sql`(${schema.prospectResearchRuns.finishedAt} AT TIME ZONE 'Asia/Dubai')::date = ${dubaiToday()}::date`));
    if (used >= p.dailyLimit) continue;
    let apiKey = "";
    try {
      apiKey = p.apiKeyEnc ? decryptSecret(p.apiKeyEnc) : "";
    } catch {
      continue;
    }
    // claim the call before making it, so two runs cannot both pass the daily limit
    await db.update(schema.prospectResearchRuns).set({ aiProviderId: p.id }).where(eq(schema.prospectResearchRuns.id, runId));
    try {
      const { text, tokens } = await searchWithAi({ provider: p.provider, baseUrl: p.baseUrl, apiKey, model: p.model, prompt: aiPrompt(c) });
      const parsed = parseAiJson(text);
      if (!parsed) return { status: "failed", providerId: p.id, tokens, error: "The AI reply was not readable." };
      const found = cleanAi(parsed);
      return { status: "used", providerId: p.id, tokens, result: found as unknown as Record<string, unknown>, plan: planFromAi(found, c) };
    } catch (e) {
      return { status: "failed", providerId: p.id, error: (e as Error).message.slice(0, 300) };
    }
  }
  return { status: "limit" };
}

/** Finishes one run: applies the crawl, asks AI only if needed, and chains a crawl when AI found the website. */
async function finishRun(run: typeof schema.prospectResearchRuns.$inferSelect) {
  const c = await companyNow(run.companyId);
  if (!c) {
    await db.update(schema.prospectResearchRuns).set({ status: "done", finishedAt: new Date(), summary: "The prospect no longer exists" }).where(eq(schema.prospectResearchRuns.id, run.id));
    return;
  }
  let summary = "";
  let needsAi = !run.domain;
  if (run.domain) {
    const plan = planFromCrawl((run.result ?? {}) as CrawlResult, c, dubaiToday());
    await applyPlan(run.companyId, plan, run.requestedBy, "Website research");
    summary = run.error && !run.pagesRead ? run.error : plan.summary;
    needsAi = plan.needsAi;
  }

  const patch: Partial<typeof schema.prospectResearchRuns.$inferInsert> = { status: "done", finishedAt: new Date() };
  if (needsAi) {
    const fresh = (await companyNow(run.companyId))!;
    const ai = await askAi(run.id, run.companyId, fresh);
    patch.aiStatus = ai.status;
    patch.aiProviderId = ai.providerId ?? null;
    patch.aiTokens = ai.tokens ?? 0;
    patch.aiResult = ai.result ?? (ai.error ? { error: ai.error } : null);
    if (ai.plan) {
      await applyPlan(run.companyId, ai.plan, run.requestedBy, "AI search");
      summary = [summary, ai.plan.summary].filter(Boolean).join(". ");
      // AI found the website we did not have: read it with the scraper too (free), instead of asking AI for more
      const site = String(ai.result?.website ?? "");
      const domain = domainOf(site);
      if (domain && !fresh.domain) {
        const [taken] = await db.select({ id: schema.prospectCompanies.id }).from(schema.prospectCompanies).where(eq(schema.prospectCompanies.domain, domain));
        if (!taken) {
          await db.update(schema.prospectCompanies).set({ website: site, domain }).where(eq(schema.prospectCompanies.id, run.companyId));
          await db.insert(schema.prospectResearchRuns).values({ companyId: run.companyId, domain, requestedBy: run.requestedBy });
          summary += `. Reading ${domain} next`;
        } else summary += `. ${domain} already belongs to another prospect`;
      }
    } else {
      const why: Record<string, string> = {
        no_provider: "No AI provider is set up for research",
        limit: "Today's AI limit is reached",
        recent: "AI already searched for this company in the last 30 days",
        failed: `AI search failed${ai.error ? `: ${ai.error}` : ""}`,
      };
      summary = [summary || (run.domain ? "" : "No website to read"), why[ai.status]].filter(Boolean).join(". ");
    }
  }
  patch.summary = summary.slice(0, 500);
  await db.update(schema.prospectResearchRuns).set(patch).where(eq(schema.prospectResearchRuns.id, run.id));
}

/**
 * One pass of the research queue (called by the worker): finish runs the scraper has read, and runs without a website
 * (those go straight to the AI step). A few at a time, so a long list never blocks the worker.
 */
export async function processResearch(limit = 5): Promise<number> {
  const runs = await db.transaction(async (tx) => {
    const picked = await tx.execute<{ id: number }>(sql`
      SELECT id FROM prospect_research_runs
      WHERE status = 'crawled' OR (status = 'queued' AND domain = '')
      ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const ids = picked.rows.map((r) => Number(r.id));
    if (!ids.length) return [];
    return tx.update(schema.prospectResearchRuns).set({ status: "applying" }).where(inArray(schema.prospectResearchRuns.id, ids)).returning();
  });
  for (const run of runs) {
    try {
      await finishRun(run);
    } catch (e) {
      console.error("[research] run", run.id, e);
      await db.update(schema.prospectResearchRuns).set({ status: "done", finishedAt: new Date(), summary: "Something went wrong while saving the findings" }).where(eq(schema.prospectResearchRuns.id, run.id));
    }
  }
  return runs.length;
}

/** The latest run of a prospect, for its Research tab. */
export async function latestResearch(companyId: number) {
  const [run] = await db
    .select({
      id: schema.prospectResearchRuns.id,
      status: schema.prospectResearchRuns.status,
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
