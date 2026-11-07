"use server";

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { enroll, type EnrollResult } from "@/lib/prospecting/outreach";
import { MERGE_FIELDS, unfilled } from "@/lib/prospecting/outreach-rules";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { parseInput } from "@/lib/user-error";

const id = z.number().int().positive();
const KNOWN = new Set<string>(MERGE_FIELDS.map((f) => f.key));

function refresh() {
  revalidatePath("/prospecting", "layout");
}

// ---------- sequences ----------

const stepSchema = z.object({
  subject: z.string().trim().max(150, "Keep subjects under 150 characters").default(""),
  body: z.string().trim().min(10, "Write the email").max(3000, "Keep each email under 3,000 characters"),
  delayDays: z.number().int().min(0).max(30, "At most 30 working days between emails"),
});

const sequenceSchema = z.object({
  name: z.string().trim().min(2, "Name the sequence").max(100),
  segmentKey: z.string().trim().max(40).default(""),
  steps: z.array(stepSchema).min(1, "Add at least one email").max(6, "At most 6 emails in a sequence"),
});
export type SequenceInput = z.input<typeof sequenceSchema>;

/** Creates or replaces a sequence with its steps. Field names are checked so a typo never reaches a prospect. */
export async function saveSequence(sequenceId: number | null, input: SequenceInput): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const d = parseInput(sequenceSchema, input);
    if (!d.steps[0].subject) throw new Problem("The first email needs a subject");
    d.steps.forEach((s, i) => {
      const bad = unfilled(`${s.subject} ${s.body}`).filter((f) => !KNOWN.has(f));
      if (bad.length) throw new Problem(`Email ${i + 1} uses unknown field${bad.length > 1 ? "s" : ""} {${bad.join("}, {")}}`);
      if (i > 0 && s.delayDays < 1) throw new Problem(`Email ${i + 1} needs at least 1 working day after the one before`);
    });
    return db.transaction(async (tx) => {
      let sid = sequenceId;
      if (sid) {
        const [row] = await tx
          .update(schema.outreachSequences)
          .set({ name: d.name, segmentKey: d.segmentKey || null, updatedAt: new Date() })
          .where(eq(schema.outreachSequences.id, sid))
          .returning({ id: schema.outreachSequences.id });
        if (!row) throw new Problem("That sequence no longer exists");
        await tx.delete(schema.outreachSequenceSteps).where(eq(schema.outreachSequenceSteps.sequenceId, sid));
      } else {
        const [row] = await tx.insert(schema.outreachSequences).values({ name: d.name, segmentKey: d.segmentKey || null }).returning({ id: schema.outreachSequences.id });
        sid = row.id;
      }
      await tx.insert(schema.outreachSequenceSteps).values(d.steps.map((s, i) => ({ sequenceId: sid!, position: i + 1, delayDays: i === 0 ? 0 : s.delayDays, subject: i === 0 ? s.subject : "", body: s.body })));
      refresh();
      return sid!;
    });
  });
}

export async function deleteSequence(sequenceId: number): Promise<Result<void>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const [used] = await db.select({ id: schema.outreachCampaigns.id }).from(schema.outreachCampaigns).where(eq(schema.outreachCampaigns.sequenceId, sequenceId)).limit(1);
    if (used) throw new Problem("A campaign uses this sequence. Delete or change the campaign first.");
    await db.delete(schema.outreachSequences).where(eq(schema.outreachSequences.id, sequenceId));
    refresh();
  });
}

// ---------- campaigns ----------

const campaignSchema = z.object({
  name: z.string().trim().min(2, "Name the campaign").max(100),
  sequenceId: id,
  mailboxIds: z.array(id).max(20).default([]),
});
export type CampaignInput = z.input<typeof campaignSchema>;

export async function createCampaign(input: CampaignInput): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const d = parseInput(campaignSchema, input);
    const [row] = await db.insert(schema.outreachCampaigns).values({ ...d, ownerId: me.id }).returning({ id: schema.outreachCampaigns.id });
    refresh();
    return row.id;
  });
}

export async function updateCampaign(campaignId: number, input: CampaignInput): Promise<Result<void>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const d = parseInput(campaignSchema, input);
    await db.update(schema.outreachCampaigns).set(d).where(eq(schema.outreachCampaigns.id, id.parse(campaignId)));
    refresh();
  });
}

/** Pause stops all sending from the campaign until it is resumed; finish stops it for good. */
export async function setCampaignStatus(campaignId: number, status: "active" | "paused" | "finished"): Promise<Result<void>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const s = parseInput(z.enum(["active", "paused", "finished"]), status);
    await db.transaction(async (tx) => {
      await tx.update(schema.outreachCampaigns).set({ status: s }).where(eq(schema.outreachCampaigns.id, campaignId));
      if (s === "finished") {
        await tx
          .update(schema.outreachEnrollments)
          .set({ status: "stopped", stopReason: "Campaign finished", nextSendAt: null, updatedAt: new Date() })
          .where(and(eq(schema.outreachEnrollments.campaignId, campaignId), inArray(schema.outreachEnrollments.status, ["writing", "draft", "active", "paused"])));
      }
    });
    refresh();
  });
}

/** Adds the main contact of each selected prospect to a campaign; the first emails wait in Review. */
export async function addToCampaign(campaignId: number, companyIds: number[]): Promise<Result<EnrollResult>> {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const list = parseInput(z.array(id).min(1, "Pick at least one prospect").max(500, "Add up to 500 prospects at a time"), companyIds);
    const [c] = await db.select({ status: schema.outreachCampaigns.status }).from(schema.outreachCampaigns).where(eq(schema.outreachCampaigns.id, campaignId));
    if (!c) throw new Problem("That campaign no longer exists");
    if (c.status === "finished") throw new Problem("That campaign is finished. Start a new one.");
    const res = await enroll(campaignId, list, me.id);
    refresh();
    return res;
  });
}

// ---------- review queue ----------

const draftSchema = z.object({
  subject: z.string().trim().min(3, "Write a subject").max(150),
  body: z.string().trim().min(20, "The email is too short").max(5000),
});

export async function saveDraft(enrollmentId: number, input: z.input<typeof draftSchema>): Promise<Result<void>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const d = parseInput(draftSchema, input);
    const [row] = await db
      .update(schema.outreachEnrollments)
      .set({ ...d, updatedAt: new Date() })
      .where(and(eq(schema.outreachEnrollments.id, enrollmentId), eq(schema.outreachEnrollments.status, "draft")))
      .returning({ id: schema.outreachEnrollments.id });
    if (!row) throw new Problem("This email is no longer waiting for review");
    refresh();
  });
}

export interface ApproveResult {
  approved: number;
  problems: string[];
}

/**
 * Approves first emails: each must have no {field} left, and the person must still be safe to email. Approved ones
 * become active and the sending queue sends them within the mailbox's hours and limits.
 */
export async function approveDrafts(enrollmentIds: number[]): Promise<Result<ApproveResult>> {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const ids = parseInput(z.array(id).min(1).max(200), enrollmentIds);
    const rows = await db
      .select({ e: schema.outreachEnrollments, name: schema.prospectCompanies.name, domain: schema.prospectCompanies.domain, startAt: schema.outreachCampaigns.startAt })
      .from(schema.outreachEnrollments)
      .innerJoin(schema.prospectCompanies, eq(schema.prospectCompanies.id, schema.outreachEnrollments.companyId))
      .innerJoin(schema.outreachCampaigns, eq(schema.outreachCampaigns.id, schema.outreachEnrollments.campaignId))
      .where(and(inArray(schema.outreachEnrollments.id, ids), eq(schema.outreachEnrollments.status, "draft")));
    const res: ApproveResult = { approved: 0, problems: [] };
    for (const r of rows) {
      const left = unfilled(`${r.e.subject} ${r.e.body}`);
      const email = r.e.toEmail.toLowerCase();
      const [blocked] = await db
        .select({ v: schema.outreachSuppression.value })
        .from(schema.outreachSuppression)
        .where(or(eq(schema.outreachSuppression.value, email), eq(schema.outreachSuppression.value, email.split("@")[1] ?? "-"), r.domain ? eq(schema.outreachSuppression.value, r.domain) : undefined))
        .limit(1);
      const problem = left.length
        ? `fill in {${left.join("}, {")}}`
        : !email
          ? "there is no email address to send to"
          : blocked
            ? "on the do-not-contact list"
            : r.e.subject.trim().length < 3
              ? "no subject"
              : "";
      if (problem) {
        res.problems.push(`${r.name}: ${problem}`);
        continue;
      }
      await db.transaction(async (tx) => {
        await tx
          .update(schema.outreachEnrollments)
          .set({ status: "active", nextSendAt: r.startAt && r.startAt > new Date() ? r.startAt : new Date(), approvedBy: me.id, approvedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.outreachEnrollments.id, r.e.id));
        await tx
          .update(schema.prospectCompanies)
          .set({ status: "in_sequence", statusChangedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(schema.prospectCompanies.id, r.e.companyId), ne(schema.prospectCompanies.status, "in_sequence")));
        await tx.insert(schema.prospectActivities).values({ companyId: r.e.companyId, userId: me.id, kind: "status", body: `First email approved: "${r.e.subject}"` });
      });
      res.approved++;
    }
    refresh();
    return res;
  });
}

export async function skipDrafts(enrollmentIds: number[]): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const ids = parseInput(z.array(id).min(1).max(200), enrollmentIds);
    const rows = await db
      .update(schema.outreachEnrollments)
      .set({ status: "skipped", stopReason: "Skipped in review", updatedAt: new Date() })
      .where(and(inArray(schema.outreachEnrollments.id, ids), eq(schema.outreachEnrollments.status, "draft")))
      .returning({ id: schema.outreachEnrollments.id });
    refresh();
    return rows.length;
  });
}

/** Stops one person's emails (draft, active or paused). */
export async function stopEnrollment(enrollmentId: number): Promise<Result<void>> {
  return attempt(async () => {
    await assertApp("prospecting");
    await db
      .update(schema.outreachEnrollments)
      .set({ status: "stopped", stopReason: "Stopped by hand", nextSendAt: null, updatedAt: new Date() })
      .where(and(eq(schema.outreachEnrollments.id, enrollmentId), inArray(schema.outreachEnrollments.status, ["writing", "draft", "active", "paused"])));
    refresh();
  });
}
