"use server";

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { isEmail } from "@/lib/mail/compose";
import { DISQUALIFY_REASONS, MANUAL_STATUSES, SUPPRESSION_REASONS, domainOf, isSignal, isStatus, statusLabel, type StatusKey } from "@/lib/prospecting/constants";
import { IMPORT_FIELDS, importedEmailStatus, rowToProspect, type ImportMapping } from "@/lib/prospecting/import";
import { guessIndustry } from "@/lib/prospecting/industry";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { rescoreIn } from "@/lib/prospecting/rescore";
import { latestResearch, queueResearch, researchQueue, RUNNING, stopQueuedResearch, type ResearchQueue } from "@/lib/prospecting/research";
import { normName } from "@/lib/sales";
import { parseInput } from "@/lib/user-error";

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.number().int().positive();
const day = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date").default("");
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .default("")
  .refine((v) => v === "" || isEmail(v), "That email address does not look right");

function refresh() {
  revalidatePath("/prospecting", "layout");
}

async function log(companyId: number, userId: number, kind: string, body: string) {
  await db.insert(schema.prospectActivities).values({ companyId, userId, kind, body });
}

/** Works the score out again from what is stored now. Called after anything that feeds it changes. */
const rescore = (companyId: number) => rescoreIn(db, companyId, dubaiToday());

async function mustExist(companyId: number) {
  const [c] = await db.select({ id: schema.prospectCompanies.id, name: schema.prospectCompanies.name, status: schema.prospectCompanies.status }).from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
  if (!c) throw new Problem("That prospect no longer exists.");
  return c;
}

/** A prospect with the same domain or the same name, if one is stored already. */
async function duplicateOf(name: string, domain: string, exceptId?: number) {
  const norm = normName(name);
  const [dup] = await db
    .select({ id: schema.prospectCompanies.id, name: schema.prospectCompanies.name })
    .from(schema.prospectCompanies)
    .where(
      and(
        or(domain ? eq(schema.prospectCompanies.domain, domain) : undefined, norm ? eq(schema.prospectCompanies.nameNorm, norm) : undefined),
        exceptId ? ne(schema.prospectCompanies.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return dup ?? null;
}

// ---------- prospects ----------

const prospectSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160),
  website: text(200),
  emirate: text(40),
  freeZone: text(80),
  licenseNo: text(60),
  licenseDate: day,
  activity: text(300),
  industry: text(60),
  segmentKey: text(40),
  sizeBand: text(20),
  phone: text(40),
  email: emailField,
  address: text(300),
  linkedinUrl: text(200),
  sourceUrl: text(500),
  notes: text(4000),
});
export type ProspectInput = z.input<typeof prospectSchema>;

function columns(d: z.output<typeof prospectSchema>) {
  return {
    ...d,
    nameNorm: normName(d.name),
    industry: guessIndustry(d.name, d.activity),
    domain: domainOf(d.website) || domainOf(d.email) || null,
    licenseDate: d.licenseDate || null,
    segmentKey: d.segmentKey || null,
  };
}

export async function createProspect(input: ProspectInput & { sourceKey?: string }) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const d = parseInput(prospectSchema, input);
    const cols = columns(d);
    const dup = await duplicateOf(d.name, cols.domain ?? "");
    if (dup) throw new Problem(`"${dup.name}" is already in the list. Open it instead of adding it twice.`);
    const [src] = await db.select({ id: schema.prospectSources.id }).from(schema.prospectSources).where(eq(schema.prospectSources.key, input.sourceKey || "manual"));
    const [row] = await db
      .insert(schema.prospectCompanies)
      .values({ ...cols, sourceId: src?.id ?? null, ownerId: me.id })
      .returning({ id: schema.prospectCompanies.id });
    await log(row.id, me.id, "created", "Added by hand");
    await rescore(row.id);
    refresh();
    return row.id;
  });
}

export async function updateProspect(companyId: number, input: ProspectInput) {
  return attempt(async () => {
    await assertApp("prospecting");
    await mustExist(companyId);
    const d = parseInput(prospectSchema, input);
    const cols = columns(d);
    const dup = await duplicateOf(d.name, cols.domain ?? "", companyId);
    if (dup) throw new Problem(`"${dup.name}" already has this name or website. Two prospects cannot be the same company.`);
    await db
      .update(schema.prospectCompanies)
      .set({ ...cols, updatedAt: new Date() })
      .where(eq(schema.prospectCompanies.id, companyId));
    await rescore(companyId);
    refresh();
  });
}

export async function deleteProspect(companyId: number) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    if (me.role !== "admin") throw new Problem("Only an admin can delete a prospect. Disqualify it instead.");
    await db.delete(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
    refresh();
  });
}

const statusSchema = z.object({
  status: z.string().refine((s) => isStatus(s) && MANUAL_STATUSES.includes(s as StatusKey), "Pick a status"),
  reason: text(80),
  snoozeUntil: day,
});

/** Moves prospects to a status by hand (one or many). Disqualifying needs a reason; "Not now" needs a date. */
export async function setProspectStatus(ids: number[], input: z.input<typeof statusSchema>) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const list = parseInput(z.array(id).min(1).max(1000), ids);
    const d = parseInput(statusSchema, input);
    if (d.status === "disqualified" && !DISQUALIFY_REASONS.includes(d.reason as (typeof DISQUALIFY_REASONS)[number])) throw new Problem("Pick why it is disqualified");
    if (d.status === "not_now" && (!d.snoozeUntil || d.snoozeUntil <= dubaiToday())) throw new Problem("Pick a date in the future to look again");
    const rows = await db
      .update(schema.prospectCompanies)
      .set({
        status: d.status,
        disqualifyReason: d.status === "disqualified" ? d.reason : "",
        snoozeUntil: d.status === "not_now" ? d.snoozeUntil : null,
        statusChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(inArray(schema.prospectCompanies.id, list), ne(schema.prospectCompanies.status, d.status)))
      .returning({ id: schema.prospectCompanies.id });
    const note = `${statusLabel(d.status)}${d.status === "disqualified" ? `: ${d.reason}` : d.status === "not_now" ? ` until ${d.snoozeUntil}` : ""}`;
    if (rows.length) await db.insert(schema.prospectActivities).values(rows.map((r) => ({ companyId: r.id, userId: me.id, kind: "status", body: note })));
    refresh();
    return rows.length;
  });
}

export async function setProspectOwner(ids: number[], ownerId: number | null) {
  return attempt(async () => {
    await assertApp("prospecting");
    const list = parseInput(z.array(id).min(1).max(1000), ids);
    await db.update(schema.prospectCompanies).set({ ownerId: ownerId ? id.parse(ownerId) : null, updatedAt: new Date() }).where(inArray(schema.prospectCompanies.id, list));
    refresh();
  });
}

/** The hook for the first email. Keep it to one or two sentences about them, not about us. */
export async function savePersonalLine(companyId: number, line: string) {
  return attempt(async () => {
    await assertApp("prospecting");
    await mustExist(companyId);
    const v = parseInput(z.string().trim().max(400, "Keep the personal line under 400 characters"), line);
    await db.update(schema.prospectCompanies).set({ personalLine: v, updatedAt: new Date() }).where(eq(schema.prospectCompanies.id, companyId));
    refresh();
  });
}

export async function addProspectNote(companyId: number, body: string) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    await mustExist(companyId);
    await log(companyId, me.id, "note", z.string().trim().min(1, "Write the note").max(4000).parse(body));
    refresh();
  });
}

// ---------- people ----------

const personSchema = z.object({
  name: z.string().trim().min(1, "Enter the person's name").max(120),
  title: text(80),
  roleKind: z.enum(["decision", "influencer", "gatekeeper"]).default("decision"),
  email: emailField,
  emailStatus: z.enum(["verified", "likely", "guess", "generic"]).default("guess"),
  emailSource: text(500),
  phone: text(40),
  linkedinUrl: text(200),
  isPrimary: z.boolean().default(false),
});
export type PersonInput = z.input<typeof personSchema>;

async function onlyPrimary(companyId: number, personId: number) {
  await db
    .update(schema.prospectPeople)
    .set({ isPrimary: false })
    .where(and(eq(schema.prospectPeople.companyId, companyId), ne(schema.prospectPeople.id, personId)));
}

export async function addPerson(companyId: number, input: PersonInput) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    await mustExist(companyId);
    const d = parseInput(personSchema, input);
    const n = await db.$count(schema.prospectPeople, eq(schema.prospectPeople.companyId, companyId));
    const [row] = await db
      .insert(schema.prospectPeople)
      .values({ ...d, companyId, isPrimary: d.isPrimary || n === 0 })
      .returning({ id: schema.prospectPeople.id, isPrimary: schema.prospectPeople.isPrimary });
    if (row.isPrimary) await onlyPrimary(companyId, row.id);
    await log(companyId, me.id, "research", `Added ${d.name}${d.title ? `, ${d.title}` : ""}`);
    await rescore(companyId);
    refresh();
  });
}

export async function updatePerson(personId: number, input: PersonInput) {
  return attempt(async () => {
    await assertApp("prospecting");
    const d = parseInput(personSchema, input);
    const [row] = await db.update(schema.prospectPeople).set(d).where(eq(schema.prospectPeople.id, personId)).returning({ companyId: schema.prospectPeople.companyId });
    if (!row) throw new Problem("That person no longer exists.");
    if (d.isPrimary) await onlyPrimary(row.companyId, personId);
    await rescore(row.companyId);
    refresh();
  });
}

export async function deletePerson(personId: number) {
  return attempt(async () => {
    await assertApp("prospecting");
    const [row] = await db.delete(schema.prospectPeople).where(eq(schema.prospectPeople.id, personId)).returning({ companyId: schema.prospectPeople.companyId });
    if (row) await rescore(row.companyId);
    refresh();
  });
}

// ---------- signals ----------

const signalSchema = z.object({
  kind: z.string().refine(isSignal, "Pick what is happening"),
  detail: z.string().trim().min(3, "Say what happened").max(400),
  sourceUrl: z.string().trim().min(4, "Add where you saw it (a link)").max(500),
  observedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it happened"),
});
export type SignalInput = z.input<typeof signalSchema>;

export async function addSignal(companyId: number, input: SignalInput) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    await mustExist(companyId);
    const d = parseInput(signalSchema, input);
    if (d.observedOn > dubaiToday()) throw new Problem("The date cannot be in the future");
    await db.insert(schema.prospectSignals).values({ ...d, companyId, createdBy: me.id });
    await log(companyId, me.id, "research", `Signal: ${d.detail}`);
    await rescore(companyId);
    refresh();
  });
}

export async function deleteSignal(signalId: number) {
  return attempt(async () => {
    await assertApp("prospecting");
    const [row] = await db.delete(schema.prospectSignals).where(eq(schema.prospectSignals.id, signalId)).returning({ companyId: schema.prospectSignals.companyId });
    if (row) await rescore(row.companyId);
    refresh();
  });
}

// ---------- import ----------

const MAX_IMPORT = 2000;
const fieldKeys = IMPORT_FIELDS.map((f) => f.key) as [string, ...string[]];

const importSchema = z.object({
  rows: z.array(z.array(z.string().max(4000))).min(1, "The file has no rows").max(MAX_IMPORT, `Import up to ${MAX_IMPORT} rows at a time; split the file`),
  mapping: z.partialRecord(z.enum(fieldKeys), z.number().int().min(-1).max(200)),
  segmentKey: text(40),
  sourceKey: text(40),
  label: text(120),
});

export interface ImportResult {
  added: number;
  duplicates: number;
  skipped: number;
}

/** Adds the rows of a checked file. Rows without a company name are skipped; companies already in the list are not added again. */
export async function commitImport(input: z.input<typeof importSchema>): Promise<Result<ImportResult>> {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const d = parseInput(importSchema, input);
    const map = d.mapping as ImportMapping;
    if (map.name === undefined || map.name < 0) throw new Problem("Choose which column has the company name");
    const [src] = await db.select({ id: schema.prospectSources.id }).from(schema.prospectSources).where(eq(schema.prospectSources.key, d.sourceKey || "file_import"));
    if (d.segmentKey) {
      const [seg] = await db.select({ key: schema.prospectSegments.key }).from(schema.prospectSegments).where(eq(schema.prospectSegments.key, d.segmentKey));
      if (!seg) throw new Problem("That segment no longer exists");
    }

    const res: ImportResult = { added: 0, duplicates: 0, skipped: 0 };
    // what is in the list already, plus what this file adds as it goes (a file often repeats a company)
    const known = await db.select({ domain: schema.prospectCompanies.domain, nameNorm: schema.prospectCompanies.nameNorm }).from(schema.prospectCompanies);
    const domains = new Set(known.map((k) => k.domain).filter(Boolean) as string[]);
    const names = new Set(known.map((k) => k.nameNorm));
    const today = dubaiToday();
    const note = `Imported${d.label ? ` from ${d.label}` : ""}`;

    for (const raw of d.rows) {
      const p = rowToProspect(raw, map);
      if (!p) {
        res.skipped++;
        continue;
      }
      const nn = normName(p.name);
      if ((p.domain && domains.has(p.domain)) || (nn && names.has(nn))) {
        res.duplicates++;
        continue;
      }
      if (p.domain) domains.add(p.domain);
      names.add(nn);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.prospectCompanies)
          .values({
            name: p.name,
            nameNorm: nn,
            domain: p.domain || null,
            website: p.website,
            email: p.personName ? "" : p.email,
            phone: p.phone,
            emirate: p.emirate,
            freeZone: p.freeZone,
            activity: p.activity,
            industry: guessIndustry(p.name, p.activity),
            licenseNo: p.licenseNo,
            licenseDate: p.licenseDate || null,
            address: p.address,
            linkedinUrl: p.linkedinUrl,
            notes: p.notes,
            segmentKey: d.segmentKey || null,
            sourceId: src?.id ?? null,
            ownerId: me.id,
          })
          .returning({ id: schema.prospectCompanies.id });
        if (p.personName) {
          await tx.insert(schema.prospectPeople).values({
            companyId: row.id,
            name: p.personName,
            title: p.personTitle,
            email: p.email,
            emailStatus: p.email ? importedEmailStatus(p.email) : "guess",
            emailSource: d.label ? `Import: ${d.label}` : "Import",
            isPrimary: true,
          });
        }
        // a licence date from a register is itself a signal (newly licensed)
        if (p.licenseDate && Date.parse(today) - Date.parse(p.licenseDate) < 180 * 86400_000) {
          await tx.insert(schema.prospectSignals).values({ companyId: row.id, kind: "new_license", detail: `Licensed on ${p.licenseDate}`, sourceUrl: d.label || "Import", observedOn: p.licenseDate, createdBy: me.id });
        }
        await tx.insert(schema.prospectActivities).values({ companyId: row.id, userId: me.id, kind: "import", body: note });
        res.added++;
        await rescoreIn(tx, row.id, today);
      });
    }
    refresh();
    return res;
  });
}

// ---------- suppression ----------

/** Blocks an email address or a whole domain from every campaign. Accepts "a@b.ae", "b.ae" or a website. */
export async function addSuppression(input: { value: string; reason?: string; note?: string }) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const raw = parseInput(z.string().trim().toLowerCase().min(3, "Enter an email or a domain").max(254), input.value);
    const reason = parseInput(z.enum(SUPPRESSION_REASONS).default("manual"), input.reason || undefined);
    const note = parseInput(text(300), input.note ?? "");
    let value: string;
    let kind: "email" | "domain";
    if (raw.includes("@") && !raw.includes("/")) {
      if (!isEmail(raw)) throw new Problem("That email address does not look right");
      value = raw;
      kind = "email";
    } else {
      value = domainOf(raw);
      kind = "domain";
      if (!value) throw new Problem("Enter a company domain like example.ae (free mail domains such as gmail.com cannot be blocked whole)");
    }
    const [row] = await db.insert(schema.outreachSuppression).values({ value, kind, reason, note, createdBy: me.id }).onConflictDoNothing().returning({ id: schema.outreachSuppression.id });
    if (!row) throw new Problem(`${value} is already blocked`);
    refresh();
  });
}

export async function removeSuppression(suppressionId: number) {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const [row] = await db.select({ reason: schema.outreachSuppression.reason }).from(schema.outreachSuppression).where(eq(schema.outreachSuppression.id, suppressionId));
    // someone who unsubscribed asked us to stop: only an admin may undo that
    if (row && (row.reason === "unsubscribe" || row.reason === "complaint") && me.role !== "admin") throw new Problem("Only an admin can remove an unsubscribe or a complaint.");
    await db.delete(schema.outreachSuppression).where(eq(schema.outreachSuppression.id, suppressionId));
    refresh();
  });
}

// ---------- segments and sources (admin) ----------

async function assertProspectingAdmin() {
  const me = await assertApp("prospecting");
  if (me.role !== "admin") throw new Problem("Only an admin can change this");
  return me;
}

const segmentSchema = z.object({
  label: z.string().trim().min(2, "Enter a name").max(80),
  offer: text(300),
  keyRoles: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  active: z.boolean().default(true),
});

export async function updateSegment(key: string, input: z.input<typeof segmentSchema>) {
  return attempt(async () => {
    await assertProspectingAdmin();
    const d = parseInput(segmentSchema, input);
    await db.update(schema.prospectSegments).set(d).where(eq(schema.prospectSegments.key, z.string().max(40).parse(key)));
    refresh();
  });
}

const sourceSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  url: text(500),
  access: z.enum(["scrape", "api", "manual", "import"]),
  segmentKey: text(40),
  notes: text(1000),
  termsCheckedAt: day,
  enabled: z.boolean().default(true),
});
export type SourceInput = z.input<typeof sourceSchema>;

function sourceCols(d: z.output<typeof sourceSchema>) {
  // the scraper may only read a site once someone has checked its terms and robots rules
  if (d.access === "scrape" && !d.termsCheckedAt) throw new Problem("Check the site's terms and robots rules first, and enter the date you did");
  return { ...d, segmentKey: d.segmentKey || null, termsCheckedAt: d.termsCheckedAt || null };
}

export async function createSource(input: SourceInput) {
  return attempt(async () => {
    await assertProspectingAdmin();
    const d = parseInput(sourceSchema, input);
    const base =
      d.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 30) || "source";
    const key = `${base}_${Date.now().toString(36)}`;
    await db.insert(schema.prospectSources).values({ ...sourceCols(d), key });
    refresh();
  });
}

export async function updateSource(sourceId: number, input: SourceInput) {
  return attempt(async () => {
    await assertProspectingAdmin();
    const d = parseInput(sourceSchema, input);
    await db.update(schema.prospectSources).set(sourceCols(d)).where(eq(schema.prospectSources.id, id.parse(sourceId)));
    refresh();
  });
}

// ---------- research ----------

/** Queues website research for one prospect or a selection. The scraper reads the sites; AI is only a last resort. */
/** Queues research for one prospect or a selection: "site" reads the website only, "ai" adds the AI steps. */
export async function startResearch(ids: number[], mode: "site" | "ai" = "site"): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const list = parseInput(z.array(id).min(1, "Pick at least one prospect").max(200, "Research up to 200 prospects at a time"), ids);
    const n = await queueResearch(list, me.id, z.enum(["site", "ai"]).parse(mode));
    if (!n) throw new Problem(list.length === 1 ? "Research is already running for this prospect." : "Research is already running for these prospects.");
    refresh();
    return n;
  });
}

/** Whether a prospect's latest research run is still going, for the page to refresh when it ends. */
export async function researchState(companyId: number): Promise<Result<{ running: boolean; stage: string; summary: string }>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const run = await latestResearch(id.parse(companyId));
    return { running: !!run && RUNNING.includes(run.status), stage: run?.stage ?? "", summary: run?.summary ?? "" };
  });
}

/** The research queue, for the progress panel (polled every few seconds while research is going). */
export async function researchProgress(): Promise<Result<ResearchQueue>> {
  return attempt(async () => {
    await assertApp("prospecting");
    return researchQueue();
  });
}

/** Stops the research runs that have not started yet. */
export async function stopResearch(): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const n = await stopQueuedResearch();
    if (!n) throw new Problem("Nothing is waiting; the runs being read now will finish.");
    refresh();
    return n;
  });
}

/** Puts a found email or phone on the company (replacing what is there). */
export async function applyFinding(companyId: number, kind: "email" | "phone", value: string): Promise<Result<void>> {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    await mustExist(companyId);
    const v = kind === "email" ? emailField.parse(value) : z.string().trim().min(7, "That phone number is too short").max(40).parse(value);
    await db
      .update(schema.prospectCompanies)
      .set({ [kind]: v, updatedAt: new Date() })
      .where(eq(schema.prospectCompanies.id, companyId));
    await log(companyId, me.id, "research", `Company ${kind} set to ${v}`);
    await rescore(companyId);
    refresh();
  });
}
